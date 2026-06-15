type WasmPluginRequest = {
  id: string;
  bytes: Uint8Array;
  input: string;
};

type WasmPluginResponse =
  | {
      id: string;
      ok: true;
      output: string;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

type WasmPluginExports = {
  memory?: WebAssembly.Memory;
  alloc?: (length: number) => number;
  dealloc?: (pointer: number, length: number) => void;
  transform?: (pointer: number, length: number) => number;
};

function wasmPluginError(message: string): never {
  throw new Error(message);
}

async function runWasmPlugin({ bytes, input }: WasmPluginRequest) {
  const module = await WebAssembly.instantiate(bytes, {});
  const exports = module.instance.exports as WasmPluginExports;
  const memory = exports.memory ?? wasmPluginError("WASM plugin must export memory");
  const alloc = exports.alloc ?? wasmPluginError("WASM plugin must export alloc(length)");
  const transform =
    exports.transform ?? wasmPluginError("WASM plugin must export transform(pointer, length)");
  const inputBytes = new TextEncoder().encode(input);
  const inputPointer = alloc(inputBytes.length);
  const inputMemory = new Uint8Array(memory.buffer, inputPointer, inputBytes.length);

  inputMemory.set(inputBytes);

  const outputPointer = transform(inputPointer, inputBytes.length);
  const outputLength = new DataView(memory.buffer).getUint32(outputPointer, true);
  const outputBytes = new Uint8Array(memory.buffer, outputPointer + 4, outputLength);
  const output = new TextDecoder().decode(outputBytes.slice());

  exports.dealloc?.(inputPointer, inputBytes.length);
  exports.dealloc?.(outputPointer, outputLength + 4);

  return output;
}

self.onmessage = (event: MessageEvent<WasmPluginRequest>) => {
  void runWasmPlugin(event.data)
    .then((output) => {
      self.postMessage({
        id: event.data.id,
        ok: true,
        output,
      } satisfies WasmPluginResponse);
    })
    .catch((error) => {
      self.postMessage({
        id: event.data.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies WasmPluginResponse);
    });
};
