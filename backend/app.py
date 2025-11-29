# app.py
import os, json, traceback
from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import numpy as np
from flask_cors import CORS
from svgpathtools import svg2paths2

# import our synth module
from synth_and_export import synthesize_and_export, OUTDIR

app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)

session_state = {}  # holds parts, joints, keyframes, trajectories

# -------------------
# Utilities
# -------------------
def parse_svg(svg_path):
    # read the first path and sample its points (using svgpathtools)
    try:
        paths, attributes, svg_att = svg2paths2(svg_path)
    except Exception:
        # fallback: simple square
        return [[0,0],[50,0],[50,50],[0,50]]
    if not paths:
        return [[0,0],[50,0],[50,50],[0,50]]
    path = paths[0]
    pts = []
    for seg in path:
        # each segment has start and end; sample a few points per segment to get smoother polygon
        try:
            # add start
            pts.append([seg.start.real, seg.start.imag])
        except Exception:
            pass
    # ensure at least 4 pts
    if len(pts) < 4:
        pts = [[0,0],[50,0],[50,50],[0,50]]
    return pts

@app.post("/upload-svg")
def upload_svg():
    print("📥 /upload-svg hit")

    # 1. Check if files came through
    print("request.files =", request.files)
    if "file" not in request.files:
        print("❌ No 'file' in request.files")
        return jsonify({"error": "no file field in request"}), 400

    file = request.files["file"]
    print("Received file:", file)
    print("Filename:", repr(file.filename))

    # 2. Empty filename?
    if not file.filename:
        print("❌ File has empty filename")
        return jsonify({"error": "empty filename"}), 400

    # Ensure uploads folder exists
    print("cwd =", os.getcwd())
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    save_path = os.path.join(UPLOAD_FOLDER, file.filename)
    print("Saving to:", save_path)

    try:
        file.save(save_path)
        print("✅ File saved!")
    except Exception as e:
        print("❌ ERROR saving file:", e)
        return jsonify({"error": "save failed", "detail": str(e)}), 500

    # Read SVG contents
    try:
        with open(save_path, "r", encoding="utf-8") as f:
            svg_text = f.read()
        print("✅ SVG loaded, length =", len(svg_text))
    except Exception as e:
        print("❌ ERROR reading SVG:", e)
        return jsonify({"error": "read failed", "detail": str(e)}), 500

    return jsonify({
        "filename": file.filename,
        "saved_to": save_path,
        "svg_content": svg_text
    })


@app.route("/define-joints", methods=["POST"])
def define_joints():
    data = request.json
    session_state["joints"] = data.get("joints", [])
    return jsonify({"status":"ok"})

@app.route("/keyframes", methods=["POST"])
def keyframes():
    data = request.json
    session_state["keyframes"] = data.get("keyframes", {})
    return jsonify({"status":"ok"})

@app.route("/generate", methods=["POST"])
def generate():
    try:
        if "keyframes" not in session_state:
            return jsonify({"status":"error", "msg":"no keyframes"}), 400
        # compute simple trajectories from keyframes:
        # keyframes structure expected: { part_name: [ {x,y,rotation}, ... ] }
        trajectories = {}
        n_frames = None
        for part_name, poses in session_state["keyframes"].items():
            if n_frames is None:
                n_frames = len(poses)
            else:
                n_frames = max(n_frames, len(poses))
        # for each part, produce a sampled 2D trajectory by taking (x,y) from each keyframe
        for part_name, poses in session_state["keyframes"].items():
            pts = []
            for p in poses:
                pts.append([p.get("x", 0), p.get("y", 0)])
            # if fewer poses than n_frames, repeat final
            while len(pts) < n_frames:
                pts.append(pts[-1])
            trajectories[part_name] = pts

        session_state["trajectories"] = trajectories

        # Run synthesis per part (synthesize 4-bar for each trajectory)
        results = {}
        for idx, (part_name, pts) in enumerate(trajectories.items()):
            # create a unique prefix per part for output files
            prefix = f"{idx}_{os.path.splitext(part_name)[0]}"
            res = synthesize_and_export(pts, outdir=OUTDIR, name_prefix=prefix, n_angles=120, verbose=0)
            results[part_name] = res

        # Prepare animation frames: simple mapping of keyframe poses (no interpolation beyond frames)
        animation = []
        for f in range(n_frames):
            frame = {}
            for part_name, poses in session_state["keyframes"].items():
                p = poses[f] if f < len(poses) else poses[-1]
                frame[part_name] = {"x": p.get("x", 0), "y": p.get("y", 0), "rotation": p.get("rotation", 0)}
            animation.append(frame)

        return jsonify({"status":"ok", "synthesis": results, "animation": animation})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status":"error", "msg": str(e)}), 500

@app.route("/restart", methods=["POST"])
def restart():
    session_state.clear()
    # optionally clean generated files
    # WARNING: uncomment if you want generated cleaned each restart
    # for f in os.listdir(OUTDIR):
    #     os.remove(os.path.join(OUTDIR,f))
    return jsonify({"status":"ok"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
