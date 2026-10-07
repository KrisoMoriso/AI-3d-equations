'use strict';

// Convert a screen position into a world-space ray and hit the nearest mesh triangle.
function inverseMatrix(matrix) {
  const rows = Array.from({ length: 4 }, (_, row) => [
    ...Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]),
    ...Array.from({ length: 4 }, (_, column) => Number(row === column)),
  ]);
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    rows[column] = rows[column].map((value) => value / divisor);
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
    }
  }
  return Array.from({ length: 16 }, (_, index) => rows[index % 4][4 + Math.floor(index / 4)]);
}

function screenRay(x, y, width, height, matrix, domain) {
  if (!width || !height || x < 0 || y < 0 || x > width || y > height) return null;
  const inverse = inverseMatrix(matrix);
  if (!inverse) return null;
  const nx = (2 * x) / width - 1,
    ny = 1 - (2 * y) / height;
  const unproject = (z) => {
    const point = Array.from(
      { length: 4 },
      (_, row) =>
        inverse[row] * nx + inverse[4 + row] * ny + inverse[8 + row] * z + inverse[12 + row],
    );
    return point.slice(0, 3).map((value) => (value / point[3]) * domain);
  };
  const origin = unproject(-1),
    far = unproject(1);
  const delta = far.map((value, index) => value - origin[index]);
  const maxDistance = Math.hypot(...delta);
  if (!origin.every(Number.isFinite) || !Number.isFinite(maxDistance) || !maxDistance) return null;
  return { origin, direction: delta.map((value) => value / maxDistance), maxDistance };
}

function triangleDistance(ray, vertices, offset) {
  const ax = vertices[offset],
    ay = vertices[offset + 1],
    az = vertices[offset + 2];
  const e1x = vertices[offset + 6] - ax,
    e1y = vertices[offset + 7] - ay,
    e1z = vertices[offset + 8] - az;
  const e2x = vertices[offset + 12] - ax,
    e2y = vertices[offset + 13] - ay,
    e2z = vertices[offset + 14] - az;
  const [dx, dy, dz] = ray.direction;
  const px = dy * e2z - dz * e2y,
    py = dz * e2x - dx * e2z,
    pz = dx * e2y - dy * e2x;
  const determinant = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(determinant) < 1e-12) return null;
  const tx = ray.origin[0] - ax,
    ty = ray.origin[1] - ay,
    tz = ray.origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) / determinant;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const qx = ty * e1z - tz * e1y,
    qy = tz * e1x - tx * e1z,
    qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) / determinant;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const distance = (e2x * qx + e2y * qy + e2z * qz) / determinant;
  return distance >= 0 && distance <= ray.maxDistance ? distance : null;
}

function pickSurface(ray, surfaces) {
  if (!ray) return null;
  let nearest = null;
  for (const equation of surfaces) {
    const vertices = equation.mesh.vertices;
    for (let offset = 0; offset < vertices.length; offset += 18) {
      const distance = triangleDistance(ray, vertices, offset);
      if (distance === null || (nearest && distance >= nearest.distance)) continue;
      nearest = {
        equationId: equation.id,
        distance,
        position: ray.origin.map((value, index) => value + distance * ray.direction[index]),
      };
    }
  }
  return nearest;
}
