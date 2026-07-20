import struct

def read_png(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    
    sig = data[:8]
    print(f'PNG signature valid: {sig == b"\\x89PNG\\r\\n\\x1a\\n"}')
    
    pos = 8
    chunks = []
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8].decode('ascii', errors='replace')
        chunk_data = data[pos+8:pos+8+length]
        chunks.append((chunk_type, length, chunk_data[:50]))
        pos += 12 + length
    
    print(f'Total chunks: {len(chunks)}')
    for ct, ln, cd in chunks:
        print(f'  {ct}: {ln} bytes')
        if ct in ('tEXt', 'zTXt', 'iTXt'):
            try:
                print(f'    Text: {cd.decode("utf-8", errors="replace")}')
            except:
                print(f'    Text: {cd[:100]}')
    
    ihdr_pos = data.find(b'IHDR')
    if ihdr_pos > 0:
        w = struct.unpack('>I', data[ihdr_pos+4:ihdr_pos+8])[0]
        h = struct.unpack('>I', data[ihdr_pos+8:ihdr_pos+12])[0]
        bpp = data[ihdr_pos+12]
        color_type = data[ihdr_pos+13]
        print(f'\nImage: {w}x{h}, bit depth: {bpp}, color type: {color_type}')

read_png(r'C:\Users\kingo\Downloads\735fb297-e1df-4694-be5c-ce49ae122d1b.png')