# synth_and_export.py
import os, math, json
import numpy as np
from scipy.optimize import least_squares
import cadquery as cq
from shapely.geometry import LineString

OUTDIR = "generated"

# ---- Four-bar forward + fit (same algorithmic starter as earlier) ----
def fourbar_coupler_curve(params, thetas):
    """
    params: vector length 9:
     [Ax,Ay, Dx,Dy, L_ab, L_bc, L_cd, px, py]
    thetas: array of crank angles
    returns: Nx2 array of coupler point positions
    """
    Ax,Ay, Dx,Dy, L_ab, L_bc, L_cd, px, py = params
    results = []
    for th in thetas:
        # B = crank end
        Bx = Ax + L_ab * math.cos(th)
        By = Ay + L_ab * math.sin(th)
        # Solve circle intersection: circle(B, L_bc) and circle(D, L_cd)
        bx, by = Bx, By
        dx, dy = Dx, Dy
        r0, r1 = L_bc, L_cd
        dx0 = dx - bx; dy0 = dy - by
        d = math.hypot(dx0, dy0)
        if d < 1e-9:
            Cx, Cy = bx + r0, by
        else:
            if d > r0 + r1:
                t = r0 / (r0 + r1)
                Cx = bx + dx0 * t
                Cy = by + dy0 * t
            else:
                a = (r0*r0 - r1*r1 + d*d) / (2*d)
                h_sq = max(0.0, r0*r0 - a*a)
                xm = bx + (a * dx0) / d
                ym = by + (a * dy0) / d
                # choose one of two solutions; pick one consistently
                if h_sq <= 0:
                    Cx, Cy = xm, ym
                else:
                    rx = -dy0 * (math.sqrt(h_sq)/d)
                    ry = dx0 * (math.sqrt(h_sq)/d)
                    Cx = xm + rx
                    Cy = ym + ry
        # coupler frame: x along B->C
        vx = Cx - bx; vy = Cy - by
        ang = math.atan2(vy, vx) if (abs(vx)>1e-9 or abs(vy)>1e-9) else 0.0
        cos, sin = math.cos(ang), math.sin(ang)
        world_x = bx + px * cos - py * sin
        world_y = by + px * sin + py * cos
        results.append([world_x, world_y])
    return np.array(results)

def residual(params, sample_points, thetas):
    pts = fourbar_coupler_curve(params, thetas)
    res = (pts - sample_points).ravel()
    return res

def fit_fourbar(sample_points, n_angles=120, verbose=0):
    s = np.array(sample_points)
    # resample s to length n_angles
    N = n_angles
    if len(s) < 2:
        raise ValueError("need at least 2 sample points")
    linestring = LineString(s.tolist())
    total_len = linestring.length
    samples = []
    for i in range(N):
        pos = linestring.interpolate(total_len * i/(N-1))
        samples.append([pos.x, pos.y])
    s = np.array(samples)

    thetas = np.linspace(0, 2*math.pi, N)
    # initial guess heuristics: center sample bounding box
    cx = float(np.mean(s[:,0])); cy = float(np.mean(s[:,1]))
    Ax,Ay = cx - 20.0, cy
    Dx,Dy = cx + 40.0, cy
    L_ab = 20.0; L_bc = 40.0; L_cd = 35.0
    px, py = 10.0, 0.0
    x0 = np.array([Ax,Ay, Dx,Dy, L_ab, L_bc, L_cd, px, py])
    lower = np.array([cx-200, cy-200, cx-200, cy-200, 1.0, 1.0, 1.0, -200, -200])
    upper = np.array([cx+200, cy+200, cx+200, cy+200, 400.0, 400.0, 400.0, 200, 200])
    res = least_squares(residual, x0, args=(s, thetas), bounds=(lower, upper), verbose=verbose, max_nfev=500)
    return res.x, thetas, s

# ---- Simple CAD builders ----
def make_bar(length, thickness=6.0, hole_d=3.2):
    # Create a bar along +X centered on origin; returns a CadQuery object
    w = thickness
    depth = 6.0
    bar = cq.Workplane("XY").rect(length, w).extrude(depth)
    # center hole at origin for pin
    bar = bar.faces(">Z").workplane(centerOption="CenterOfMass").hole(hole_d)
    return bar

def make_coupler(px, py, size_hint=12.0, thickness=6.0, hole_d=3.2):
    r = max(size_hint, math.hypot(px, py) + 6.0)
    part = cq.Workplane("XY").circle(r).extrude(thickness)
    # hole at coupler attachment
    part = part.faces(">Z").workplane().center(px, py).hole(hole_d)
    return part

def export_parts(params, outdir=OUTDIR, name_prefix="part"):
    os.makedirs(outdir, exist_ok=True)
    Ax,Ay, Dx,Dy, L_ab, L_bc, L_cd, px, py = params
    parts = {}
    # crank
    crank = make_bar(L_ab)
    crank_path = os.path.join(outdir, f"{name_prefix}_crank.step")
    crank.val().exportStep(crank_path)
    parts["crank"] = crank_path
    # coupler bar
    coupler = make_bar(L_bc)
    coupler_path = os.path.join(outdir, f"{name_prefix}_coupler.step")
    coupler.val().exportStep(coupler_path)
    parts["coupler"] = coupler_path
    # follower
    follower = make_bar(L_cd)
    follower_path = os.path.join(outdir, f"{name_prefix}_follower.step")
    follower.val().exportStep(follower_path)
    parts["follower"] = follower_path
    # coupler disc
    disc = make_coupler(px, py)
    disc_path = os.path.join(outdir, f"{name_prefix}_coupler_disc.step")
    disc.val().exportStep(disc_path)
    parts["coupler_disc"] = disc_path

    # assembly metadata
    assembly = {
        "A": [Ax,Ay],
        "D": [Dx,Dy],
        "lengths": {"L_ab": L_ab, "L_bc": L_bc, "L_cd": L_cd},
        "coupler_attachment":[px,py],
        "parts": parts
    }
    meta_path = os.path.join(outdir, f"{name_prefix}_assembly.json")
    with open(meta_path, "w") as f:
        json.dump(assembly, f, indent=2)
    parts["assembly"] = meta_path
    return parts, assembly

# ---- Convenience top-level function used by backend ----
def synthesize_and_export(sample_points, outdir=OUTDIR, name_prefix="part", n_angles=120, verbose=0):
    """Fit a 4-bar to sample_points and export STEP files"""
    params, thetas, sampled = fit_fourbar(sample_points, n_angles=n_angles, verbose=verbose)
    exported, assembly = export_parts(params, outdir=outdir, name_prefix=name_prefix)
    # also compute coupler curve for preview
    coupler_curve = fourbar_coupler_curve(params, thetas).tolist()
    return {"params": params.tolist(), "assembly": assembly, "exported": exported, "coupler_curve": coupler_curve}