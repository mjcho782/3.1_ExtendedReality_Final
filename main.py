from ultralytics import YOLO
import cv2
import math

# ==========================
# 1. Camera input
# ==========================

# If your headset camera appears as a normal video device,
# change 0 to the correct index (0, 1, 2, ...) or a device path.
cap = cv2.VideoCapture(0)
cap.set(3, 640)  # width
cap.set(4, 480)  # height

# ==========================
# 2. Load YOLO model
# ==========================

# Adjust path if your weights are elsewhere
model = YOLO("yolo-Weights/yolov8n.pt")

# COCO class names
classNames = [
    "person", "bicycle", "car", "motorbike", "aeroplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "sofa", "pottedplant", "bed", "diningtable", "toilet", "tvmonitor", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush"
]

while True:
    success, img = cap.read()
    if not success:
        print("Failed to read from camera")
        break

    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2  # center of the frame

    # Run YOLO inference (stream=True yields generator of results)
    results = model(img, stream=True)

    # We'll remember which box contains the center, if any
    center_box = None
    center_cls = None
    center_conf = None

    # First pass: find all boxes and the one that contains the center point
    for r in results:
        boxes = r.boxes

        for box in boxes:
            # bounding box
            x1, y1, x2, y2 = box.xyxy[0]
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

            # confidence
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            label = classNames[cls] if 0 <= cls < len(classNames) else str(cls)

            # Check if the center point lies inside this box
            if x1 <= cx <= x2 and y1 <= cy <= y2:
                # If multiple boxes contain center, keep the one with highest conf
                if center_box is None or conf > center_conf:
                    center_box = (x1, y1, x2, y2)
                    center_cls = label
                    center_conf = conf

            # Draw normal box and label (outline)
            cv2.rectangle(img, (x1, y1), (x2, y2), (255, 0, 255), 2)
            text = f"{label} {conf:.2f}"
            cv2.putText(
                img, text, (x1, max(y1 - 5, 0)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 255), 1
            )

    # Second pass: darken the box that contains the center, if it exists
    if center_box is not None:
        x1, y1, x2, y2 = center_box

        # Ensure bounds are within image
        x1 = max(0, min(x1, w - 1))
        x2 = max(0, min(x2, w - 1))
        y1 = max(0, min(y1, h - 1))
        y2 = max(0, min(y2, h - 1))

        # Extract ROI and darken it
        roi = img[y1:y2, x1:x2]
        # Create a dark overlay the same size as ROI
        overlay = roi.copy()
        # Make overlay darker (black)
        overlay[:] = (0, 0, 0)
        # Blend with original ROI to slightly darken it (0.5 can be tuned)
        alpha = 0.5
        cv2.addWeighted(overlay, alpha, roi, 1 - alpha, 0, roi)

        # Optionally draw a thicker box around the darkened region
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 0), 2)

    # Draw a small crosshair at the center for debugging
    crosshair_color = (0, 255, 0)
    cv2.drawMarker(
        img, (cx, cy), crosshair_color,
        markerType=cv2.MARKER_CROSS, markerSize=12, thickness=2
    )

    # Show result
    cv2.imshow('YOLO - Center Highlight', img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
