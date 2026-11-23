// Minimal PLY reader: vertex x/y/z, optional red/green/blue (uchar 0..255 or float 0..1), nx/ny/nz, and label
// (per-point ground-truth class, 255 = unlabeled; written by tools/export_demo_scene.py).
// Supports binary_little_endian and ascii.

const SIZES = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };

function reader(view, type) {
  switch (type) {
    case 'char': case 'int8': return (o) => view.getInt8(o);
    case 'uchar': case 'uint8': return (o) => view.getUint8(o);
    case 'short': case 'int16': return (o) => view.getInt16(o, true);
    case 'ushort': case 'uint16': return (o) => view.getUint16(o, true);
    case 'int': case 'int32': return (o) => view.getInt32(o, true);
    case 'uint': case 'uint32': return (o) => view.getUint32(o, true);
    case 'float': case 'float32': return (o) => view.getFloat32(o, true);
    case 'double': case 'float64': return (o) => view.getFloat64(o, true);
  }
  throw new Error(`unsupported PLY type ${type}`);
}

export function parsePly(buffer) {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1 << 16)));
  const m = /end_header\r?\n/.exec(head);
  if (!head.startsWith('ply') || !m) throw new Error('not a PLY file');
  const headerEnd = m.index + m[0].length;
  const lines = new TextDecoder().decode(bytes.subarray(0, headerEnd)).split(/\r?\n/);
  let format = null, count = 0, props = [], inVertex = false, preVertexBytes = 0;
  for (const line of lines) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'format') format = t[1];
    else if (t[0] === 'element') { inVertex = t[1] === 'vertex'; if (inVertex) count = parseInt(t[2]); else if (!count) throw new Error('vertex must be the first element'); }
    else if (t[0] === 'property' && inVertex) {
      if (t[1] === 'list') throw new Error('list properties on vertices are not supported');
      props.push({ type: t[1], name: t[2] });
    }
  }
  if (format !== 'binary_little_endian' && format !== 'ascii') throw new Error(`unsupported PLY format ${format}`);
  const idx = Object.fromEntries(props.map((p, i) => [p.name, i]));
  for (const k of ['x', 'y', 'z']) if (!(k in idx)) throw new Error(`PLY without ${k}`);
  const hasColor = ['red', 'green', 'blue'].every((k) => k in idx);
  const hasNormal = ['nx', 'ny', 'nz'].every((k) => k in idx);
  const hasLabel = 'label' in idx;
  const colorIsFloat = hasColor && props[idx.red].type.startsWith('float');

  const coord = new Float32Array(count * 3);
  const color = new Float32Array(hasColor ? count * 3 : 0);
  const normal = new Float32Array(hasNormal ? count * 3 : 0);
  const label = new Uint8Array(hasLabel ? count : 0);
  const take = (get) => {
    for (let i = 0; i < count; i++) {
      coord[3 * i] = get(i, idx.x); coord[3 * i + 1] = get(i, idx.y); coord[3 * i + 2] = get(i, idx.z);
      if (hasColor) {
        const s = colorIsFloat ? 255 : 1;
        color[3 * i] = get(i, idx.red) * s; color[3 * i + 1] = get(i, idx.green) * s; color[3 * i + 2] = get(i, idx.blue) * s;
      }
      if (hasNormal) { normal[3 * i] = get(i, idx.nx); normal[3 * i + 1] = get(i, idx.ny); normal[3 * i + 2] = get(i, idx.nz); }
      if (hasLabel) label[i] = get(i, idx.label);
    }
  };
  if (format === 'binary_little_endian') {
    const view = new DataView(buffer, headerEnd);
    const offsets = []; let stride = 0;
    for (const p of props) { offsets.push(stride); stride += SIZES[p.type]; }
    const reads = props.map((p) => reader(view, p.type));
    take((i, k) => reads[k](i * stride + offsets[k]));
  } else {
    const rows = new TextDecoder().decode(bytes.subarray(headerEnd)).trim().split(/\r?\n/, count).map((l) => l.trim().split(/\s+/).map(Number));
    take((i, k) => rows[i][k]);
  }
  return { count, coord, color, normal, label };
}
