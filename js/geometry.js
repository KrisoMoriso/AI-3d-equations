'use strict';

// Vector normalization and triangle mesh generation for both equation modes.
const normalized = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
function surfaceMesh(f, d, n) {
  const vertices = [],
    normals = [],
    positions = [],
    zs = [];
  const step = (2 * d) / n,
    h = step * 0.03;
  let zmin = Infinity,
    zmax = -Infinity;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = -d + i * step,
        y = -d + j * step,
        z = f(x, y, 0);
      const valid = Number.isFinite(z) && Math.abs(z) <= d;
      positions.push(valid ? [x, y, z] : null);
      if (valid) {
        zmin = Math.min(zmin, z);
        zmax = Math.max(zmax, z);
      }
      let dx = (f(x + h, y, 0) - f(x - h, y, 0)) / (2 * h),
        dy = (f(x, y + h, 0) - f(x, y - h, 0)) / (2 * h);
      normals.push(
        Number.isFinite(dx) && Number.isFinite(dy) ? normalized([-dx, -dy, 1]) : [0, 0, 1],
      );
    }
  function triangle(a, b, c) {
    const pa = positions[a],
      pb = positions[b],
      pc = positions[c];
    if (!pa || !pb || !pc) return;
    if (
      Math.max(Math.abs(pa[2] - pb[2]), Math.abs(pb[2] - pc[2]), Math.abs(pc[2] - pa[2])) >
      Math.max(step * 12, d * 0.65)
    )
      return;
    for (const k of [a, b, c]) {
      vertices.push(...positions[k], ...normals[k]);
      zs.push(positions[k][2]);
    }
  }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i,
        b = a + 1,
        c = a + n + 1,
        e = c + 1;
      triangle(a, b, e);
      triangle(a, e, c);
    }
  return { vertices, zmin, zmax };
}
// Marching tetrahedra: przekrój F=0 w sześcianie domeny.
function implicitMesh(f, d, n) {
  const vertices = [],
    step = (2 * d) / n,
    h = step * 0.025,
    N = n + 1,
    values = new Float64Array(N * N * N);
  const idx = (i, j, k) => i + N * (j + N * k);
  let zmin = Infinity,
    zmax = -Infinity;
  for (let k = 0; k < N; k++)
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++)
        values[idx(i, j, k)] = f(-d + i * step, -d + j * step, -d + k * step);
  const corners = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    tets = [
      [0, 5, 1, 6],
      [0, 1, 2, 6],
      [0, 2, 3, 6],
      [0, 3, 7, 6],
      [0, 7, 4, 6],
      [0, 4, 5, 6],
    ];
  const normal = (p) => {
    const [x, y, z] = p;
    return normalized([
      f(x + h, y, z) - f(x - h, y, z),
      f(x, y + h, z) - f(x, y - h, z),
      f(x, y, z + h) - f(x, y, z - h),
    ]);
  };
  function tri(a, b, c) {
    const ab = b.map((v, i) => v - a[i]),
      ac = c.map((v, i) => v - a[i]);
    if (
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) < 1e-12
    )
      return;
    for (const p of [a, b, c]) {
      const norm = normal(p);
      if (!norm.every(Number.isFinite)) return;
    }
    for (const p of [a, b, c]) {
      vertices.push(...p, ...normal(p));
      zmin = Math.min(zmin, p[2]);
      zmax = Math.max(zmax, p[2]);
    }
  }
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const vs = corners.map((c) => values[idx(i + c[0], j + c[1], k + c[2])]);
        if (!vs.every(Number.isFinite) || vs.every((v) => v >= 0) || vs.every((v) => v < 0))
          continue;
        const ps = corners.map((c) => [
          -d + (i + c[0]) * step,
          -d + (j + c[1]) * step,
          -d + (k + c[2]) * step,
        ]);
        const edge = (a, b) => {
          const t = vs[a] / (vs[a] - vs[b]);
          return ps[a].map((v, l) => v + t * (ps[b][l] - v));
        };
        for (const tet of tets) {
          const inside = tet.filter((a) => vs[a] < 0),
            outside = tet.filter((a) => vs[a] >= 0);
          if (!inside.length || !outside.length) continue;
          if (inside.length === 1) {
            tri(...outside.map((b) => edge(inside[0], b)));
          } else if (inside.length === 3) {
            tri(...inside.map((a) => edge(a, outside[0])));
          } else {
            const a = edge(inside[0], outside[0]),
              b = edge(inside[0], outside[1]),
              c = edge(inside[1], outside[0]),
              e = edge(inside[1], outside[1]);
            tri(a, b, c);
            tri(b, e, c);
          }
        }
      }
  return { vertices, zmin, zmax };
}
