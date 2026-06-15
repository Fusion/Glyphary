import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const i32 = 0x7f;
const emptyBlock = 0x40;
const wasmMagicAndVersion = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

function u32(value) {
  const bytes = [];
  let next = value >>> 0;

  do {
    let byte = next & 0x7f;
    next >>>= 7;

    if (next !== 0) {
      byte |= 0x80;
    }

    bytes.push(byte);
  } while (next !== 0);

  return bytes;
}

function i32leb(value) {
  const bytes = [];
  let next = value | 0;
  let more = true;

  while (more) {
    const byte = next & 0x7f;
    next >>= 7;
    const signBitSet = (byte & 0x40) !== 0;

    more = !((next === 0 && !signBitSet) || (next === -1 && signBitSet));
    bytes.push(more ? byte | 0x80 : byte);
  }

  return bytes;
}

function utf8(value) {
  return Array.from(new TextEncoder().encode(value));
}

function vector(items) {
  return [...u32(items.length), ...items.flat()];
}

function name(value) {
  const bytes = utf8(value);

  return [...u32(bytes.length), ...bytes];
}

function section(id, payload) {
  return [id, ...u32(payload.length), ...payload];
}

function functionType(params, results = []) {
  return [0x60, ...vector(params), ...vector(results)];
}

function exportEntry(exportName, kind, index) {
  return [...name(exportName), kind, ...u32(index)];
}

function functionBody(localGroups, instructions) {
  const locals = vector(localGroups.map(([count, type]) => [...u32(count), type]));
  const body = [...locals, ...instructions, 0x0b];

  return [...u32(body.length), ...body];
}

const typeSection = section(
  1,
  vector([
    functionType([i32], [i32]),
    functionType([i32, i32], []),
    functionType([i32, i32], [i32]),
  ]),
);

const functionSection = section(3, vector([[0], [1], [2]].map(([index]) => u32(index))));
const memorySection = section(5, vector([[0x00, ...u32(2)]]));
const globalSection = section(6, vector([[
  i32,
  0x01,
  0x41,
  ...i32leb(1024),
  0x0b,
]]));
const exportSection = section(
  7,
  vector([
    exportEntry("memory", 0x02, 0),
    exportEntry("alloc", 0x00, 0),
    exportEntry("dealloc", 0x00, 1),
    exportEntry("transform", 0x00, 2),
  ]),
);

// alloc(length) -> pointer
//
// This is a simple bump allocator. Glyphary calls alloc for the input, and the
// transform uses it again for the output. The sample never reuses memory; real
// plugins can implement a better allocator behind the same ABI.
const allocBody = functionBody(
  [[1, i32]],
  [
    0x23, 0x00, // global.get heap
    0x22, 0x01, // local.tee oldHeap
    0x23, 0x00, // global.get heap
    0x20, 0x00, // local.get length
    0x6a, // i32.add
    0x41, ...i32leb(7), // i32.const 7
    0x6a, // i32.add
    0x41, ...i32leb(-8), // i32.const -8
    0x71, // i32.and, align to 8 bytes
    0x24, 0x00, // global.set heap
  ],
);

const deallocBody = functionBody([], []);

// transform(pointer, length) -> outputPointer
//
// Output is a 4-byte little-endian length prefix followed by UTF-8 bytes.
// This sample uppercases ASCII a-z and leaves all other bytes untouched.
const transformBody = functionBody(
  [[3, i32]],
  [
    0x20, 0x01, // local.get length
    0x41, ...i32leb(4), // i32.const 4
    0x6a, // i32.add
    0x10, 0x00, // call alloc
    0x21, 0x02, // local.set output

    0x20, 0x02, // local.get output
    0x20, 0x01, // local.get length
    0x36, 0x02, 0x00, // i32.store align=4 offset=0

    0x41, ...i32leb(0), // i32.const 0
    0x21, 0x03, // local.set i

    0x02, emptyBlock, // block
    0x03, emptyBlock, // loop
    0x20, 0x03, // local.get i
    0x20, 0x01, // local.get length
    0x4f, // i32.ge_u
    0x0d, 0x01, // br_if outer block

    0x20, 0x00, // local.get input
    0x20, 0x03, // local.get i
    0x6a, // i32.add
    0x2d, 0x00, 0x00, // i32.load8_u align=1 offset=0
    0x21, 0x04, // local.set c

    0x20, 0x02, // local.get output
    0x41, ...i32leb(4), // i32.const 4
    0x6a, // i32.add
    0x20, 0x03, // local.get i
    0x6a, // i32.add

    0x20, 0x04, // local.get c
    0x41, ...i32leb(97), // i32.const 'a'
    0x4f, // i32.ge_u
    0x20, 0x04, // local.get c
    0x41, ...i32leb(122), // i32.const 'z'
    0x4d, // i32.le_u
    0x71, // i32.and
    0x04, i32, // if result i32
    0x20, 0x04, // local.get c
    0x41, ...i32leb(32), // i32.const 32
    0x6b, // i32.sub
    0x05, // else
    0x20, 0x04, // local.get c
    0x0b, // end if

    0x3a, 0x00, 0x00, // i32.store8 align=1 offset=0

    0x20, 0x03, // local.get i
    0x41, ...i32leb(1), // i32.const 1
    0x6a, // i32.add
    0x21, 0x03, // local.set i
    0x0c, 0x00, // br loop
    0x0b, // end loop
    0x0b, // end block

    0x20, 0x02, // local.get output
  ],
);

const codeSection = section(10, vector([allocBody, deallocBody, transformBody]));
const wasm = Uint8Array.from([
  ...wasmMagicAndVersion,
  ...typeSection,
  ...functionSection,
  ...memorySection,
  ...globalSection,
  ...exportSection,
  ...codeSection,
]);

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "plugin.wasm");

writeFileSync(outputPath, wasm);
console.log(`Wrote ${outputPath} (${wasm.length} bytes)`);
