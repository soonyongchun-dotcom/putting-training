import argparse
import os
import queue
from datetime import datetime
import cv2
import numpy as np

# ==============================================================================
# 1. COCO 17 관절 및 스켈레톤 연결 구조
# ==============================================================================
JOINTS = {
    'nose': 0, 'l_shoulder': 5, 'r_shoulder': 6,
    'l_elbow': 7, 'r_elbow': 8, 'l_wrist': 9, 'r_wrist': 10,
    'l_hip': 11, 'r_hip': 12, 'l_knee': 13, 'r_knee': 14,
    'l_ankle': 15, 'r_ankle': 16
}

BONES = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),     # 어깨 및 양팔
    (5, 11), (6, 12), (11, 12),                  # 몸통(척추/골반)
    (11, 13), (13, 15), (12, 14), (14, 16)       # 양다리
]

# ==============================================================================
# 2. YOLOv8-Pose 추출기 (화면 중앙의 메인 골퍼 1인 자동 고정)
# ==============================================================================
def extract_main_golfer_2d(video_path, model_path='yolov8n-pose.pt'):
    from scipy.signal import savgol_filter
    from ultralytics import YOLO

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"영상 파일을 찾을 수 없습니다: {video_path}")

    model = YOLO(model_path)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise ValueError(f"영상을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 120.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    raw_frames = []
    kpts_2d_img = []   # 원본 이미지 픽셀 좌표 (시각화용)
    kpts_2d_math = []  # Y축 반전 수학 좌표 (3D 연산용)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        raw_frames.append(frame)

        results = model(frame, verbose=False)
        boxes = results[0].boxes.xyxy.cpu().numpy() if results[0].boxes is not None else []
        kpts = results[0].keypoints.xy.cpu().numpy() if results[0].keypoints is not None else []

        if len(kpts) > 0:
            # 바운딩 박스 면적이 가장 큰 사람(메인 골퍼) 선택
            areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
            best_idx = int(np.argmax(areas))
            pt_img = kpts[best_idx].copy()
        else:
            pt_img = kpts_2d_img[-1].copy() if kpts_2d_img else np.zeros((17, 2))

        pt_math = pt_img.copy()
        pt_math[:, 1] = -pt_math[:, 1]  # 위쪽이 +Y가 되도록 반전

        kpts_2d_img.append(pt_img)
        kpts_2d_math.append(pt_math)

    cap.release()
    if len(raw_frames) < 4:
        raise ValueError(f"3D 복원에는 최소 4프레임이 필요합니다: {video_path}")

    kpts_2d_img = np.array(kpts_2d_img)
    kpts_2d_math = np.array(kpts_2d_math)

    # 미세 떨림(Jitter) 제거를 위한 Savitzky-Golay 스무딩 필터 적용
    if len(kpts_2d_math) >= 11:
        for j in range(17):
            for d in range(2):
                kpts_2d_math[:, j, d] = savgol_filter(kpts_2d_math[:, j, d], window_length=9, polyorder=2)
                kpts_2d_img[:, j, d] = savgol_filter(kpts_2d_img[:, j, d], window_length=9, polyorder=2)

    return raw_frames, kpts_2d_img, kpts_2d_math, fps, (w, h)


# ==============================================================================
# 3. 3대 이벤트(어드레스·탑·임팩트) 검출 및 3D 스켈레톤 복원
# ==============================================================================
def detect_anchors(kpts_math):
    """왼손목(9번) 궤적 기준 어드레스(P1), 탑(P4), 임팩트(P7), 피니시(P9) 자동 검출"""
    l_wrist = kpts_math[:, JOINTS['l_wrist'], :]
    top_idx = int(np.argmax(l_wrist[:, 1]))

    # 탑 이전 정지 구간 끝점 = 어드레스
    if top_idx > 5:
        vel = np.linalg.norm(np.diff(l_wrist[:top_idx], axis=0), axis=1)
        still = np.where(vel < np.percentile(vel, 30))[0]
        addr_idx = int(still[-1]) if len(still) > 0 else 0
    else:
        addr_idx = 0

    # 탑 이후 어드레스 손목 높이 통과 지점 = 임팩트
    addr_y = l_wrist[addr_idx, 1]
    post_y = l_wrist[top_idx:, 1]
    imp_idx = min(len(kpts_math) - 1, top_idx + int(np.argmin(np.abs(post_y - addr_y))))
    end_idx = min(len(kpts_math) - 1, imp_idx + max(10, int((imp_idx - top_idx) * 0.6)))

    return addr_idx, top_idx, imp_idx, end_idx


def reconstruct_3d_skeleton(fo_math, dtl_math, norm_steps=180,
                            anchors_fo=None, anchors_dtl=None):
    from scipy.interpolate import interp1d

    if norm_steps < 5:
        raise ValueError("정확한 4개 이벤트 동기화를 위해 결과 프레임은 5개 이상이어야 합니다.")

    def select_anchors(kpts, selected, view_name):
        if selected is None:
            return detect_anchors(kpts)
        anchors = tuple(int(index) for index in selected)
        if len(anchors) != 4:
            raise ValueError(f"{view_name} 기준점은 어드레스·탑·임팩트·피니시 4개가 필요합니다.")
        if any(index < 0 or index >= len(kpts) for index in anchors):
            raise ValueError(f"{view_name} 기준점 프레임이 영상 범위를 벗어났습니다.")
        if any(current <= previous for previous, current in zip(anchors, anchors[1:])):
            raise ValueError(f"{view_name} 기준점은 어드레스부터 피니시까지 순서대로 지정해야 합니다.")
        return anchors

    anchors_fo = select_anchors(fo_math, anchors_fo, "정면")
    anchors_dtl = select_anchors(dtl_math, anchors_dtl, "측면")

    print(f"  - [정면 A 앵커 프레임] 어드레스:{anchors_fo[0]}, 탑:{anchors_fo[1]}, 임팩트:{anchors_fo[2]}, 종료:{anchors_fo[3]}")
    print(f"  - [측면 B 앵커 프레임] 어드레스:{anchors_dtl[0]}, 탑:{anchors_dtl[1]}, 임팩트:{anchors_dtl[2]}, 종료:{anchors_dtl[3]}")

    def normalize_view(kpts, anchors, is_front):
        a_idx, t_idx, i_idx, e_idx = anchors
        hip_c0 = 0.5 * (kpts[a_idx, JOINTS['l_hip']] + kpts[a_idx, JOINTS['r_hip']])
        sh_c0 = 0.5 * (kpts[a_idx, JOINTS['l_shoulder']] + kpts[a_idx, JOINTS['r_shoulder']])
        spine_len = np.linalg.norm(sh_c0 - hip_c0) + 1e-6

        norm = (kpts - hip_c0) / spine_len

        # 방향 통일: 정면은 타깃 방향이 +X, 측면은 볼 방향이 +Z
        if is_front:
            if norm[a_idx, JOINTS['l_ankle'], 0] < norm[a_idx, JOINTS['r_ankle'], 0]:
                norm[:, :, 0] *= -1.0
        else:
            if norm[a_idx, JOINTS['l_wrist'], 0] < norm[a_idx, JOINTS['l_ankle'], 0]:
                norm[:, :, 0] *= -1.0

        # 각 이벤트를 두 영상의 동일한 출력 프레임에 고정해 구간별 길이 차이를 보정한다.
        raw_f = np.array([a_idx, t_idx, i_idx, e_idx], dtype=float)
        for k in range(1, 4):
            if raw_f[k] <= raw_f[k - 1]:
                raw_f[k] = raw_f[k - 1] + 1.0

        phases = np.array([0.0, 0.55, 0.80, 1.0])
        event_steps = np.rint(phases * (norm_steps - 1)).astype(int)
        mapped_idx = np.empty(norm_steps, dtype=float)
        for segment in range(len(phases) - 1):
            start_step, end_step = event_steps[segment:segment + 2]
            mapped_idx[start_step:end_step + 1] = np.linspace(
                raw_f[segment], raw_f[segment + 1], end_step - start_step + 1
            )
        mapped_idx = np.clip(mapped_idx, 0, len(norm) - 1)

        out = np.zeros((norm_steps, 17, 2))
        src_x = np.arange(len(norm))
        for j in range(17):
            for d in range(2):
                out[:, j, d] = interp1d(src_x, norm[:, j, d], kind='cubic')(mapped_idx)

        return out, mapped_idx

    fo_sync, map_idx_fo = normalize_view(fo_math, anchors_fo, is_front=True)
    dtl_sync, map_idx_dtl = normalize_view(dtl_math, anchors_dtl, is_front=False)

    # 3D 직교좌표 융합: X(정면 좌우), Y(수직 평균), Z(측면 깊이)
    skel_3d = np.zeros((norm_steps, 17, 3))
    skel_3d[:, :, 0] = fo_sync[:, :, 0]
    skel_3d[:, :, 1] = 0.5 * (fo_sync[:, :, 1] + dtl_sync[:, :, 1])
    skel_3d[:, :, 2] = dtl_sync[:, :, 0]

    # 발선(Stance Line) 기준 Yaw 회전 보정
    ankle_vec = skel_3d[0, JOINTS['l_ankle']] - skel_3d[0, JOINTS['r_ankle']]
    yaw = np.arctan2(ankle_vec[2], ankle_vec[0])
    c, s = np.cos(-yaw), np.sin(-yaw)
    rot_y = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
    skel_3d = np.einsum('ij,ntj->nti', rot_y, skel_3d)

    # 뼈 길이 일정 유지(IK) 제약 보정
    ref_len = {(p, ch): np.linalg.norm(skel_3d[0, ch] - skel_3d[0, p]) for p, ch in BONES}
    hierarchy = [(11, 13), (13, 15), (12, 14), (14, 16), (11, 5), (12, 6), (5, 7), (7, 9), (6, 8), (8, 10)]
    for t in range(norm_steps):
        for p, ch in hierarchy:
            target = ref_len.get((p, ch), ref_len.get((ch, p)))
            vec = skel_3d[t, ch] - skel_3d[t, p]
            skel_3d[t, ch] = skel_3d[t, p] + (vec / (np.linalg.norm(vec) + 1e-8)) * target

    return skel_3d, map_idx_fo, map_idx_dtl


# ==============================================================================
# 4. [정면 A | 측면 B | 복원 3D 모델] 3분할 동기화 검증 영상 출력
# ==============================================================================
def draw_2d_skeleton(frame, pts_img):
    vis = frame.copy()
    for p, ch in BONES:
        pt1 = tuple(np.round(pts_img[p]).astype(int))
        pt2 = tuple(np.round(pts_img[ch]).astype(int))
        cv2.line(vis, pt1, pt2, (255, 220, 0), 3)
    for j in range(5, 17):
        pt = tuple(np.round(pts_img[j]).astype(int))
        cv2.circle(vis, pt, 5, (0, 80, 255), -1)
    return vis


def draw_video_panel(frame, pts_img, title, frame_index, panel_size):
    panel_w, panel_h = panel_size
    header_h, footer_h, margin = 42, 30, 14
    panel = np.full((panel_h, panel_w, 3), (15, 23, 42), dtype=np.uint8)
    cv2.rectangle(panel, (0, 0), (panel_w, header_h), (30, 41, 59), -1)
    cv2.putText(panel, title, (margin, 28), cv2.FONT_HERSHEY_SIMPLEX,
                0.62, (235, 242, 250), 2, cv2.LINE_AA)

    image = draw_2d_skeleton(frame, pts_img)
    height, width = image.shape[:2]
    available_h = panel_h - header_h - footer_h - margin
    scale = min((panel_w - margin * 2) / width, available_h / height)
    resized = cv2.resize(
        image, (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    )
    x = (panel_w - resized.shape[1]) // 2
    y = header_h + (available_h - resized.shape[0]) // 2
    panel[y:y + resized.shape[0], x:x + resized.shape[1]] = resized

    cv2.rectangle(panel, (0, panel_h - footer_h), (panel_w, panel_h), (30, 41, 59), -1)
    cv2.putText(panel, f"Source frame: {frame_index}", (margin, panel_h - 9),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (148, 163, 184), 1, cv2.LINE_AA)
    return panel


def export_3d_verification_video(
    fo_frames, fo_img_kpts, map_fo,
    dtl_frames, dtl_img_kpts, map_dtl,
    skel_3d, output_mp4="verify_3d_output.mp4", fps=30
):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    N = len(skel_3d)
    panel_w, panel_h = 640, 480
    total_w, total_h = panel_w * 3, panel_h

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_mp4, fourcc, fps, (total_w, total_h))
    if not writer.isOpened():
        writer.release()
        raise OSError(f"결과 영상을 만들 수 없습니다: {output_mp4}")

    fig = plt.figure(figsize=(panel_w / 100.0, panel_h / 100.0), dpi=100)
    ax = fig.add_subplot(111, projection='3d')
    wrist_traj = skel_3d[:, JOINTS['l_wrist'], :]
    x_extent = max(0.8, float(np.max(np.abs(skel_3d[:, :, 0]))) + 0.15)
    depth_extent = max(0.8, float(np.max(np.abs(skel_3d[:, :, 2]))) + 0.15)
    ground_level = min(-0.1, float(np.min(skel_3d[:, :, 1])) - 0.08)
    height_max = max(1.4, float(np.max(skel_3d[:, :, 1])) + 0.12)
    arm_bones = {(5, 7), (7, 9), (6, 8), (8, 10)}
    torso_bones = {(5, 6), (5, 11), (6, 12), (11, 12)}

    for t in range(N):
        idx_a = int(np.clip(round(map_fo[t]), 0, len(fo_frames) - 1))
        idx_b = int(np.clip(round(map_dtl[t]), 0, len(dtl_frames) - 1))
        img_a = draw_video_panel(
            fo_frames[idx_a], fo_img_kpts[idx_a],
            "01  FRONT CAMERA  |  LEFT / RIGHT", idx_a, (panel_w, panel_h)
        )
        img_b = draw_video_panel(
            dtl_frames[idx_b], dtl_img_kpts[idx_b],
            "02  SIDE CAMERA  |  DEPTH", idx_b, (panel_w, panel_h)
        )

        ax.clear()
        ax.set_facecolor('#0f172a')
        fig.patch.set_facecolor('#0f172a')
        ax.set_xlim([-x_extent, x_extent])
        ax.set_ylim([-depth_extent, depth_extent])
        ax.set_zlim([ground_level, height_max])
        ax.set_box_aspect((2 * x_extent, 2 * depth_extent, height_max - ground_level))
        ax.set_proj_type('ortho')
        ax.view_init(elev=22, azim=-52)
        ax.set_title(
            "03  3D RECONSTRUCTION  |  FIXED ISOMETRIC VIEW",
            color="#f8fafc", fontsize=9, fontweight="bold", pad=8
        )
        ax.set_xlabel("X  FRONT: LEFT / RIGHT", color="#cbd5e1", fontsize=7, labelpad=3)
        ax.set_ylabel("Z  SIDE: DEPTH", color="#cbd5e1", fontsize=7, labelpad=3)
        ax.set_zlabel("Y  UP", color="#cbd5e1", fontsize=7, labelpad=2)
        ax.tick_params(colors="#94a3b8", labelsize=6, pad=1)
        ax.grid(True, color="#334155", linewidth=0.6, alpha=0.7)
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            axis.pane.set_facecolor((0.05, 0.09, 0.16, 1.0))
            axis.pane.set_edgecolor("#475569")

        # Coordinates in this plot are X (front), Z (side depth), and Y (up).
        ax.plot(
            [-x_extent, x_extent], [0, 0], [ground_level, ground_level],
            color="#10b981", lw=1.5, ls="--", alpha=0.8
        )
        ax.scatter(
            [x_extent * 0.78], [0], [ground_level + 0.025],
            color="#facc15", s=24, depthshade=False
        )

        pts = skel_3d[t]
        for p, ch in BONES:
            xs = [pts[p, 0], pts[ch, 0]]
            ys = [pts[p, 2], pts[ch, 2]]
            zs = [pts[p, 1], pts[ch, 1]]
            bone = (p, ch)
            color = (
                "#22d3ee" if bone in arm_bones else
                "#fbbf24" if bone in torso_bones else
                "#e2e8f0"
            )
            ax.plot(xs, ys, zs, color=color, lw=3.0, solid_capstyle="round")

        ax.scatter(pts[5:, 0], pts[5:, 2], pts[5:, 1],
                   color="#fb7185", s=18, depthshade=False)

        if t > 1:
            ax.plot(wrist_traj[:t+1, 0], wrist_traj[:t+1, 2], wrist_traj[:t+1, 1],
                    color="#67e8f9", lw=1.5, alpha=0.75)
        ax.text2D(
            0.03, 0.97, f"STEP {t + 1:03d} / {N:03d}",
            transform=ax.transAxes, color="#94a3b8", fontsize=7, va="top"
        )

        fig.canvas.draw()
        buf = np.asarray(fig.canvas.buffer_rgba())
        img_3d = cv2.cvtColor(buf, cv2.COLOR_RGBA2BGR)
        img_3d = cv2.resize(img_3d, (panel_w, panel_h))

        combined = np.hstack([img_a, img_b, img_3d])
        writer.write(combined)

    writer.release()
    plt.close(fig)
    print(f"\n[성공] 3분할 3D 검증 영상이 출력되었습니다 -> {output_mp4}")


def generate_3d_result(front_video, side_video, output_video, coordinates_path,
                        model_path='yolov8n-pose.pt', steps=180, on_status=None,
                        anchors_front=None, anchors_side=None):
    if steps < 5:
        raise ValueError("기준점 동기화를 위해 결과 프레임 수는 5개 이상이어야 합니다.")

    def report(message):
        print(message)
        if on_status:
            on_status(message)

    report("정면 영상에서 포즈를 분석하고 있습니다...")
    fo_frames, fo_img, fo_math, _, _ = extract_main_golfer_2d(
        front_video, model_path=model_path
    )
    report("측면 영상에서 포즈를 분석하고 있습니다...")
    dtl_frames, dtl_img, dtl_math, _, _ = extract_main_golfer_2d(
        side_video, model_path=model_path
    )

    report("두 영상 동기화 및 3D 스켈레톤 복원 중...")
    skel_3d, map_fo, map_dtl = reconstruct_3d_skeleton(
        fo_math, dtl_math, norm_steps=steps,
        anchors_fo=anchors_front, anchors_dtl=anchors_side
    )
    np.save(coordinates_path, skel_3d)
    report(f"3D 좌표 저장 완료: {coordinates_path}")

    report("정면·측면·3D 합성 영상 생성 중...")
    export_3d_verification_video(
        fo_frames, fo_img, map_fo,
        dtl_frames, dtl_img, map_dtl,
        skel_3d, output_mp4=output_video, fps=30
    )
    return output_video


def launch_gui():
    import tkinter as tk
    from concurrent.futures import ThreadPoolExecutor
    from tkinter import filedialog, messagebox, ttk
    from PIL import Image, ImageTk

    anchor_events = (
        ("address", "어드레스"),
        ("top", "백스윙 탑"),
        ("impact", "임팩트"),
        ("finish", "피니시"),
    )

    class Swing3DApp:
        def __init__(self, root):
            self.root = root
            self.root.title("골프 스윙 3D 분석")
            self.root.geometry("1150x760")
            self.root.minsize(900, 620)
            self.root.configure(bg="#111827")

            self.front_path = tk.StringVar()
            self.side_path = tk.StringVar()
            self.work_dir = tk.StringVar(value="정면 영상을 선택하면 저장 폴더가 표시됩니다.")
            self.status = tk.StringVar(value="정면·측면 영상을 불러오고 기준점을 지정하세요.")
            self.messages = queue.Queue()
            self.executor = ThreadPoolExecutor(max_workers=1)
            self.future = None
            self.video = None
            self.frame_count = 0
            self.current_frame = 0
            self.video_fps = 30.0
            self.playing = False
            self.after_id = None
            self.slider_updating = False
            self.photo = None
            self.anchor_events = anchor_events
            self.anchor_selections = {"front": {}, "side": {}}
            self.input_views = {}

            style = ttk.Style()
            style.theme_use("clam")
            style.configure("TFrame", background="#111827")
            style.configure("TLabel", background="#111827", foreground="#e5e7eb",
                            font=("맑은 고딕", 10))
            style.configure("Title.TLabel", font=("맑은 고딕", 18, "bold"),
                            foreground="#f9fafb")
            style.configure("TButton", font=("맑은 고딕", 10), padding=6)
            style.configure("TEntry", padding=5)

            outer = ttk.Frame(root, padding=16)
            outer.pack(fill="both", expand=True)
            ttk.Label(outer, text="골프 스윙 3D 분석", style="Title.TLabel").pack(anchor="w")
            ttk.Label(
                outer,
                text="양쪽 영상에서 같은 스윙 이벤트를 지정하면 시간 동기화가 개선됩니다. "
                     "기준점을 지정하지 않으면 자동 검출합니다."
            ).pack(anchor="w", pady=(2, 10))

            inputs = ttk.Frame(outer)
            inputs.pack(fill="x")
            self.add_file_row(inputs, 0, "정면 영상", self.front_path, self.select_front)
            self.add_file_row(inputs, 1, "측면 영상", self.side_path, self.select_side)
            ttk.Label(inputs, text="작업 폴더", width=11).grid(
                row=2, column=0, sticky="w", pady=3
            )
            ttk.Entry(inputs, textvariable=self.work_dir, state="readonly").grid(
                row=2, column=1, columnspan=2, sticky="ew", padx=8, pady=3
            )
            inputs.columnconfigure(1, weight=1)

            actions = ttk.Frame(outer)
            actions.pack(fill="x", pady=(10, 8))
            self.generate_button = ttk.Button(
                actions, text="3D 결과 생성", command=self.start_generation
            )
            self.generate_button.pack(side="left")
            self.progress = ttk.Progressbar(actions, mode="indeterminate", length=200)
            self.progress.pack(side="left", padx=12)
            ttk.Label(actions, textvariable=self.status).pack(side="left", fill="x", expand=True)

            self.notebook = ttk.Notebook(outer)
            self.notebook.pack(fill="both", expand=True)
            input_tab = ttk.Frame(self.notebook, padding=8)
            result_tab = ttk.Frame(self.notebook, padding=8)
            self.notebook.add(input_tab, text="영상 및 기준점")
            self.notebook.add(result_tab, text="3D 결과 재생")
            self.result_tab = result_tab

            view_row = ttk.Frame(input_tab)
            view_row.pack(fill="both", expand=True)
            self.build_input_view(view_row, "front", "정면 영상")
            self.build_input_view(view_row, "side", "측면 영상")
            view_row.columnconfigure(0, weight=1)
            view_row.columnconfigure(1, weight=1)
            view_row.rowconfigure(0, weight=1)
            ttk.Label(
                input_tab,
                text="각 영상에서 프레임을 이동한 뒤 같은 이벤트 버튼을 누르세요. "
                     "수동 지정 시 두 영상 모두 4개 기준점이 필요합니다."
            ).pack(anchor="w", pady=(8, 0))

            self.preview = tk.Label(
                result_tab, text="3D 결과를 생성하면 영상이 여기에 표시됩니다.",
                bg="#0f172a", fg="#94a3b8", font=("맑은 고딕", 14)
            )
            self.preview.pack(fill="both", expand=True, pady=(4, 8))

            controls = ttk.Frame(result_tab)
            controls.pack(fill="x")
            self.play_button = ttk.Button(
                controls, text="재생", command=self.toggle_play, state="disabled"
            )
            self.play_button.pack(side="left")
            self.timeline = ttk.Scale(
                controls, from_=0, to=1, command=self.seek, state="disabled"
            )
            self.timeline.pack(side="left", fill="x", expand=True, padx=10)
            self.time_label = ttk.Label(controls, text="00:00 / 00:00")
            self.time_label.pack(side="left")

            self.root.protocol("WM_DELETE_WINDOW", self.close)
            self.root.after(100, self.poll_worker)

        def build_input_view(self, parent, view, title):
            panel = ttk.LabelFrame(parent, text=title, padding=8)
            panel.grid(
                row=0, column=0 if view == "front" else 1,
                sticky="nsew", padx=5
            )
            panel.columnconfigure(0, weight=1)
            panel.rowconfigure(0, weight=1)
            image_label = tk.Label(
                panel, text="영상을 불러오세요.",
                bg="#0f172a", fg="#94a3b8",
                font=("맑은 고딕", 12)
            )
            image_label.grid(row=0, column=0, sticky="nsew")

            frame_label = ttk.Label(panel, text="프레임: -")
            frame_label.grid(row=1, column=0, sticky="w", pady=(6, 0))
            frame_controls = ttk.Frame(panel)
            frame_controls.grid(row=2, column=0, sticky="ew", pady=4)
            frame_controls.columnconfigure(1, weight=1)
            previous_button = ttk.Button(
                frame_controls, text="◀ 1프레임", state="disabled",
                command=lambda: self.step_input_frame(view, -1)
            )
            previous_button.grid(row=0, column=0, padx=(0, 4))
            timeline = ttk.Scale(
                frame_controls, from_=0, to=1,
                command=lambda value: self.seek_input(view, value),
                state="disabled"
            )
            timeline.grid(row=0, column=1, sticky="ew")
            next_button = ttk.Button(
                frame_controls, text="1프레임 ▶", state="disabled",
                command=lambda: self.step_input_frame(view, 1)
            )
            next_button.grid(row=0, column=2, padx=(4, 0))

            marks = ttk.Frame(panel)
            marks.grid(row=3, column=0, sticky="ew")
            anchor_labels = {}
            mark_buttons = []
            for index, (event, label) in enumerate(self.anchor_events):
                button = ttk.Button(
                    marks, text=f"{label} 지정",
                    command=lambda event=event: self.mark_anchor(view, event),
                    state="disabled"
                )
                button.grid(row=0, column=index, sticky="ew", padx=2, pady=2)
                mark_buttons.append(button)
                marks.columnconfigure(index, weight=1)
                anchor_labels[event] = ttk.Label(marks, text=f"{label}: -")
                anchor_labels[event].grid(row=1, column=index, sticky="w", padx=2)

            clear_button = ttk.Button(
                panel, text="이 영상 기준점 초기화",
                command=lambda: self.clear_anchors(view)
            )
            clear_button.grid(row=4, column=0, sticky="e", pady=(4, 0))

            self.input_views[view] = {
                "cap": None,
                "frame_count": 0,
                "current": 0,
                "slider_updating": False,
                "photo": None,
                "image_label": image_label,
                "frame_label": frame_label,
                "timeline": timeline,
                "frame_step_buttons": (previous_button, next_button),
                "anchor_labels": anchor_labels,
                "mark_buttons": mark_buttons,
            }

        def add_file_row(self, parent, row, label, variable, command):
            ttk.Label(parent, text=label, width=11).grid(
                row=row, column=0, sticky="w", pady=3
            )
            ttk.Entry(parent, textvariable=variable).grid(
                row=row, column=1, sticky="ew", padx=8, pady=3
            )
            ttk.Button(parent, text="찾아보기", command=command).grid(
                row=row, column=2, pady=3
            )
            parent.columnconfigure(1, weight=1)

        def choose_video(self):
            return filedialog.askopenfilename(
                title="영상 선택",
                filetypes=[("동영상", "*.mp4 *.mov *.avi *.mkv *.m4v"),
                           ("모든 파일", "*.*")]
            )

        def load_input_video(self, view, path):
            state = self.input_views[view]
            if state["cap"]:
                state["cap"].release()
            cap = cv2.VideoCapture(path)
            if not cap.isOpened():
                cap.release()
                messagebox.showerror("영상 열기 실패", f"영상을 열 수 없습니다:\n{path}")
                return False
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if frame_count < 1:
                cap.release()
                messagebox.showerror("영상 열기 실패", f"프레임을 읽을 수 없습니다:\n{path}")
                return False

            state["cap"] = cap
            state["frame_count"] = frame_count
            state["timeline"].configure(
                from_=0, to=max(0, state["frame_count"] - 1), state="normal"
            )
            for button in state["mark_buttons"]:
                button.configure(state="normal")
            for button in state["frame_step_buttons"]:
                button.configure(state="normal")
            self.anchor_selections[view].clear()
            self.update_anchor_labels(view)
            self.display_input_frame(view, 0)
            return True

        def select_front(self):
            path = self.choose_video()
            if path:
                if self.load_input_video("front", path):
                    self.front_path.set(path)
                    folder = os.path.join(os.path.dirname(os.path.abspath(path)), "3D_생성작업")
                    self.work_dir.set(folder)

        def select_side(self):
            path = self.choose_video()
            if path:
                if self.load_input_video("side", path):
                    self.side_path.set(path)

        def seek_input(self, view, value):
            state = self.input_views[view]
            if state["cap"] and not state["slider_updating"]:
                index = min(
                    max(int(float(value)), 0), state["frame_count"] - 1
                )
                self.display_input_frame(view, index)

        def step_input_frame(self, view, amount):
            state = self.input_views[view]
            if state["cap"]:
                index = min(
                    max(state["current"] + amount, 0), state["frame_count"] - 1
                )
                self.display_input_frame(view, index)

        def display_input_frame(self, view, index):
            state = self.input_views[view]
            state["cap"].set(cv2.CAP_PROP_POS_FRAMES, index)
            ret, frame = state["cap"].read()
            if not ret:
                return

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            height, width = rgb.shape[:2]
            scale = min(460 / width, 260 / height, 1.0)
            if scale < 1:
                rgb = cv2.resize(
                    rgb, (int(width * scale), int(height * scale)),
                    interpolation=cv2.INTER_AREA
                )
            state["photo"] = ImageTk.PhotoImage(Image.fromarray(rgb), master=self.root)
            state["image_label"].configure(image=state["photo"], text="")
            state["current"] = index
            state["frame_label"].configure(text=f"프레임: {index} / {state['frame_count'] - 1}")
            state["slider_updating"] = True
            state["timeline"].set(index)
            state["slider_updating"] = False

        def mark_anchor(self, view, event):
            state = self.input_views[view]
            if not state["cap"]:
                messagebox.showwarning("영상 선택", "먼저 해당 영상을 불러오세요.")
                return
            self.anchor_selections[view][event] = state["current"]
            self.update_anchor_labels(view)

        def update_anchor_labels(self, view):
            selection = self.anchor_selections[view]
            for event, label in self.anchor_events:
                frame = selection.get(event)
                text = f"{label}: {frame}" if frame is not None else f"{label}: -"
                self.input_views[view]["anchor_labels"][event].configure(text=text)

        def clear_anchors(self, view):
            self.anchor_selections[view].clear()
            self.update_anchor_labels(view)

        def get_manual_anchors(self):
            has_any = any(self.anchor_selections[view] for view in ("front", "side"))
            if not has_any:
                return None

            required = {event for event, _ in self.anchor_events}
            anchors = {}
            for view, label in (("front", "정면"), ("side", "측면")):
                selection = self.anchor_selections[view]
                if set(selection) != required:
                    messagebox.showwarning(
                        "기준점 선택",
                        f"수동 동기화를 사용하려면 {label} 영상에서 어드레스·"
                        "백스윙 탑·임팩트·피니시를 모두 지정하세요. "
                        "자동 검출을 사용하려면 양쪽 기준점을 모두 초기화하세요."
                    )
                    return False
                indices = tuple(selection[event] for event, _ in self.anchor_events)
                if any(current <= previous for previous, current in zip(indices, indices[1:])):
                    messagebox.showwarning(
                        "기준점 순서",
                        f"{label} 영상에서 기준점을 어드레스부터 피니시까지 "
                        "시간 순서대로 지정하세요."
                    )
                    return False
                anchors[view] = indices
            return anchors

        def start_generation(self):
            if not self.front_path.get() or not self.side_path.get():
                messagebox.showwarning("영상 선택", "정면 영상과 측면 영상을 모두 선택하세요.")
                return

            anchors = self.get_manual_anchors()
            if anchors is False:
                return

            work_dir = self.work_dir.get()
            try:
                os.makedirs(work_dir, exist_ok=True)
            except OSError as error:
                messagebox.showerror("작업 폴더 오류", str(error))
                return

            run_name = datetime.now().strftime("3D_스윙_%Y%m%d_%H%M%S_%f")
            output = os.path.join(work_dir, run_name + ".mp4")
            coordinates = os.path.join(work_dir, run_name + ".npy")
            self.stop_playback()
            self.generate_button.configure(state="disabled")
            self.progress.start(12)
            self.status.set(
                "기준점으로 동기화합니다..." if anchors else "기준점을 자동 검출합니다..."
            )
            self.future = self.executor.submit(
                generate_3d_result,
                self.front_path.get(),
                self.side_path.get(),
                output,
                coordinates,
                on_status=lambda text: self.messages.put(text),
                anchors_front=anchors["front"] if anchors else None,
                anchors_side=anchors["side"] if anchors else None
            )

        def poll_worker(self):
            while True:
                try:
                    self.status.set(self.messages.get_nowait())
                except queue.Empty:
                    break

            if self.future and self.future.done():
                future = self.future
                self.future = None
                self.progress.stop()
                self.generate_button.configure(state="normal")
                error = future.exception()
                if error:
                    self.status.set("분석에 실패했습니다.")
                    details = f"{type(error).__name__}: {error}"
                    if isinstance(error, ModuleNotFoundError):
                        details += (
                            "\n\n필수 패키지가 실행 중인 Python에 없습니다. "
                            "프로젝트 폴더에서 다음 명령을 실행하세요:\n"
                            "python -m pip install -r requirements-3d.txt"
                        )
                    messagebox.showerror(
                        "3D 분석 실패", details
                    )
                else:
                    output = future.result()
                    self.status.set(f"완료: {output}")
                    self.load_video(output)

            self.root.after(100, self.poll_worker)

        def load_video(self, path):
            if self.video:
                self.video.release()
            self.video = cv2.VideoCapture(path)
            if not self.video.isOpened():
                self.video.release()
                self.video = None
                messagebox.showerror("재생 오류", f"결과 영상을 열 수 없습니다:\n{path}")
                return

            self.frame_count = int(self.video.get(cv2.CAP_PROP_FRAME_COUNT))
            self.video_fps = self.video.get(cv2.CAP_PROP_FPS) or 30.0
            self.current_frame = 0
            self.timeline.configure(
                from_=0, to=max(0, self.frame_count - 1), state="normal"
            )
            self.play_button.configure(state="normal")
            self.show_frame(0)
            self.notebook.select(self.result_tab)
            self.toggle_play()

        def render_frame(self, frame, index):
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            height, width = rgb.shape[:2]
            scale = min(1080 / width, 460 / height, 1.0)
            if scale < 1:
                rgb = cv2.resize(
                    rgb, (int(width * scale), int(height * scale)),
                    interpolation=cv2.INTER_AREA
                )
            self.photo = ImageTk.PhotoImage(Image.fromarray(rgb), master=self.root)
            self.preview.configure(image=self.photo, text="")
            self.current_frame = index
            self.slider_updating = True
            self.timeline.set(index)
            self.slider_updating = False
            elapsed = index / self.video_fps
            duration = self.frame_count / self.video_fps
            self.time_label.configure(
                text=f"{self.format_time(elapsed)} / {self.format_time(duration)}"
            )

        def show_frame(self, index):
            if not self.video:
                return
            self.video.set(cv2.CAP_PROP_POS_FRAMES, index)
            ret, frame = self.video.read()
            if ret:
                self.render_frame(frame, index)

        def seek(self, value):
            if not self.slider_updating and not self.playing and self.video:
                self.show_frame(int(float(value)))

        def toggle_play(self):
            if not self.video:
                return
            if self.playing:
                self.stop_playback()
                return
            self.playing = True
            self.play_button.configure(text="일시정지")
            self.advance_frame()

        def advance_frame(self):
            if not self.playing or not self.video:
                return
            next_index = self.current_frame + 1
            if next_index >= self.frame_count:
                self.stop_playback()
                return
            ret, frame = self.video.read()
            if not ret:
                self.stop_playback()
                return
            self.render_frame(frame, next_index)
            delay = max(1, int(1000 / self.video_fps))
            self.after_id = self.root.after(delay, self.advance_frame)

        def stop_playback(self):
            self.playing = False
            if self.after_id:
                self.root.after_cancel(self.after_id)
                self.after_id = None
            if hasattr(self, "play_button"):
                self.play_button.configure(text="재생")

        @staticmethod
        def format_time(seconds):
            total = int(seconds)
            return f"{total // 60:02d}:{total % 60:02d}"

        def close(self):
            self.stop_playback()
            if self.video:
                self.video.release()
            for state in self.input_views.values():
                if state["cap"]:
                    state["cap"].release()
            self.executor.shutdown(wait=False, cancel_futures=True)
            self.root.destroy()

    root = tk.Tk()
    Swing3DApp(root)
    root.mainloop()


def parse_args():
    parser = argparse.ArgumentParser(
        description="정면 및 측면 골프 스윙 영상으로 3D 스켈레톤 결과를 생성합니다."
    )
    parser.add_argument("--front", help="정면 영상 파일 경로")
    parser.add_argument("--side", help="측면 영상 파일 경로")
    parser.add_argument("--output", default="verify_3d_swing.mp4", help="결과 영상 경로")
    parser.add_argument("--coordinates", default="reconstructed_3d_coords.npy",
                        help="3D 좌표 배열 저장 경로")
    parser.add_argument("--model", default="yolov8n-pose.pt", help="YOLO pose 모델 경로")
    parser.add_argument("--steps", type=int, default=180, help="3D 결과 프레임 수")
    parser.add_argument("--preview", action="store_true", help="완료 후 결과 영상을 재생")
    parser.add_argument("--gui", action="store_true", help="파일 선택 및 재생 UI 실행")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.gui or (not args.front and not args.side):
        launch_gui()
        return
    if not args.front or not args.side:
        raise SystemExit("--front와 --side 영상 경로를 모두 지정하거나 --gui를 사용하세요.")
    if args.steps < 5:
        raise ValueError("--steps는 5 이상이어야 합니다.")

    generate_3d_result(
        args.front, args.side, args.output, args.coordinates,
        model_path=args.model, steps=args.steps
    )

    if args.preview:
        cap = cv2.VideoCapture(args.output)
        if not cap.isOpened():
            cap.release()
            raise OSError(f"결과 영상을 재생할 수 없습니다: {args.output}")
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            cv2.imshow("Front | Side | Reconstructed 3D", frame)
            if cv2.waitKey(30) & 0xFF in (ord("q"), 27):
                break
        cap.release()
        cv2.destroyAllWindows()


# ==============================================================================
# 5. 실행 진입점
# ==============================================================================
if __name__ == "__main__":
    main()