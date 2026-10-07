'use strict';

// Intersect rendered triangles with an axis-aligned plane in world coordinates.
function sliceTriangles(vertices, axis, value, domain) {
  const epsilon = Math.max(1, domain) * 1e-8;
  const segments = new Map(),
    points = new Map(),
    coplanarEdges = new Map();
  const areas = [];
  const pointKey = (point) => point.map((coordinate) => Math.round(coordinate / epsilon)).join(',');
  const edgeKey = (a, b) => [pointKey(a), pointKey(b)].sort().join('|');
  const addSegment = (a, b) => {
    if (Math.hypot(...a.map((coordinate, index) => coordinate - b[index])) <= epsilon) return;
    segments.set(edgeKey(a, b), [a, b]);
  };
  for (let offset = 0; offset < vertices.length; offset += 18) {
    const distances = [0, 6, 12].map((index) => vertices[offset + index + axis] - value);
    if (
      distances.every((distance) => distance > epsilon) ||
      distances.every((distance) => distance < -epsilon)
    )
      continue;
    const triangle = [0, 6, 12].map((index) => vertices.slice(offset + index, offset + index + 3));
    const onPlane = distances.map((distance) => Math.abs(distance) <= epsilon);
    if (onPlane.every(Boolean)) {
      const snapped = triangle.map((point) =>
        point.map((coordinate, index) => (index === axis ? value : coordinate)),
      );
      areas.push(...snapped.flat());
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ]) {
        const key = edgeKey(snapped[a], snapped[b]);
        const edge = coplanarEdges.get(key);
        if (edge) edge.count++;
        else coplanarEdges.set(key, { count: 1, a: snapped[a], b: snapped[b] });
      }
      continue;
    }
    const intersections = new Map();
    for (let index = 0; index < 3; index++) {
      if (!onPlane[index]) continue;
      const point = [...triangle[index]];
      point[axis] = value;
      intersections.set(pointKey(point), point);
    }
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      if (onPlane[a] || onPlane[b] || distances[a] * distances[b] >= 0) continue;
      const t = distances[a] / (distances[a] - distances[b]);
      const point = triangle[a].map(
        (coordinate, index) => coordinate + t * (triangle[b][index] - coordinate),
      );
      point[axis] = value;
      intersections.set(pointKey(point), point);
    }
    const hits = [...intersections.values()];
    if (hits.length === 2) addSegment(hits[0], hits[1]);
    else if (hits.length === 1) points.set(pointKey(hits[0]), hits[0]);
  }
  for (const edge of coplanarEdges.values()) {
    if (edge.count === 1) addSegment(edge.a, edge.b);
  }
  for (const [a, b] of segments.values()) {
    points.delete(pointKey(a));
    points.delete(pointKey(b));
  }
  return {
    segments: [...segments.values()].flat(2),
    points: [...points.values()].flat(),
    areas,
  };
}

function sectionPlaneVertices(axis, value, domain) {
  const freeAxes = [0, 1, 2].filter((index) => index !== axis);
  const corners = [
    [-domain, -domain],
    [domain, -domain],
    [domain, domain],
    [-domain, domain],
  ].map(([u, v]) => {
    const point = [0, 0, 0];
    point[axis] = value;
    point[freeAxes[0]] = u;
    point[freeAxes[1]] = v;
    return point;
  });
  return {
    fill: [0, 1, 2, 0, 2, 3].flatMap((index) => corners[index]),
    border: [0, 1, 1, 2, 2, 3, 3, 0].flatMap((index) => corners[index]),
  };
}

function sectionVertexData(positions) {
  const data = [];
  for (let index = 0; index < positions.length; index += 3) {
    data.push(positions[index], positions[index + 1], positions[index + 2], 0, 0, 1);
  }
  return data;
}
