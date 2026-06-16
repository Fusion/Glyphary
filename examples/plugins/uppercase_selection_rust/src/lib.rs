#![no_std]

use core::{panic::PanicInfo, ptr};

const HEAP_SIZE: usize = 64 * 1024;
const ALIGNMENT: usize = 8;

// This sample runs as one short-lived WASM instance per command, so a static
// linear heap is easier to audit than pulling in a general allocator.
static mut HEAP: [u8; HEAP_SIZE] = [0; HEAP_SIZE];
static mut NEXT_OFFSET: usize = 0;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

fn align_up(value: usize, alignment: usize) -> usize {
    (value + alignment - 1) & !(alignment - 1)
}

// Glyphary writes input bytes into memory returned by this function. A compact
// bump allocator keeps the sample dependency-free and avoids generated JS glue.
#[no_mangle]
pub extern "C" fn alloc(length: usize) -> usize {
    unsafe {
        let start = align_up(NEXT_OFFSET, ALIGNMENT);
        let end = start.saturating_add(length);

        if end > HEAP_SIZE {
            return 0;
        }

        NEXT_OFFSET = end;
        ptr::addr_of_mut!(HEAP).cast::<u8>().add(start) as usize
    }
}

// The plugin ABI returns a pointer to `[u32 length][UTF-8 output bytes...]`.
#[no_mangle]
pub extern "C" fn transform(pointer: usize, length: usize) -> usize {
    let output_pointer = alloc(length.saturating_add(4));

    if output_pointer == 0 {
        return 0;
    }

    unsafe {
        ptr::write_unaligned(output_pointer as *mut u32, length as u32);

        for index in 0..length {
            let byte = ptr::read((pointer + index) as *const u8);
            let uppercase = if byte.is_ascii_lowercase() {
                byte.to_ascii_uppercase()
            } else {
                byte
            };

            ptr::write((output_pointer + 4 + index) as *mut u8, uppercase);
        }
    }

    output_pointer
}

// Each command run gets a fresh worker/module instance, so reclaiming individual
// bump allocations would add complexity without changing observable behavior.
#[no_mangle]
pub extern "C" fn dealloc(_pointer: usize, _length: usize) {}
