from PIL import Image
import os

img = Image.open(r'C:\Users\kingo\Downloads\735fb297-e1df-4694-be5c-ce49ae122d1b.png')
print(f'Image size: {img.size}')
w, h = img.size

# Sample pixels to understand layout
print("\n=== Pixel sampling ===")
for y in range(0, h, 50):
    row_colors = []
    for x in range(0, w, 50):
        r, g, b, a = img.getpixel((x, y))
        row_colors.append(f'({r},{g},{b})')
    print(f'Row {y}: {" | ".join(row_colors[:12])}')

# Check for grid lines - look for vertical and horizontal lines of similar color
print("\n=== Checking for grid structure ===")
# Check if there are repeating patterns
# Look at the center row for repeating color patterns
center_y = h // 2
prev_color = None
segments = []
seg_start = 0
for x in range(w):
    r, g, b, a = img.getpixel((x, center_y))
    if prev_color is None:
        prev_color = (r, g, b, a)
    # If color changes significantly, mark a boundary
    if abs(r - prev_color[0]) > 20 or abs(g - prev_color[1]) > 20 or abs(b - prev_color[2]) > 20:
        if x - seg_start > 5:
            segments.append((seg_start, x, prev_color))
        seg_start = x
        prev_color = (r, g, b, a)
segments.append((seg_start, w, prev_color))

print(f"Found {len(segments)} segments in center row")
for i, (start, end, color) in enumerate(segments):
    print(f"  Segment {i}: x={start}-{end}, width={end-start}, color={color}")

# Try to detect if this is a grid of icons
# Common grids: 3x3, 4x3, 4x4, etc.
print("\n=== Trying to detect grid ===")
for cols in range(2, 8):
    for rows in range(2, 6):
        cell_w = w // cols
        cell_h = h // rows
        # Check if this grid makes sense by looking at center of each cell
        valid = True
        for r in range(rows):
            for c in range(cols):
                cx = c * cell_w + cell_w // 2
                cy = r * cell_h + cell_h // 2
                if cx < w and cy < h:
                    pixel = img.getpixel((cx, cy))
                    # Check if pixel is not a grid line (not too dark/light)
                    avg = (pixel[0] + pixel[1] + pixel[2]) / 3
                    if avg < 10 or avg > 245:
                        valid = False
        if valid:
            print(f"  Grid {cols}x{rows} (cell {cell_w}x{cell_h}) - VALID")

# Save individual cells as separate images
print("\n=== Saving individual icons ===")
# Based on analysis, try to determine the grid
# Let's try 4 columns x 3 rows (common for icon sets)
cols, rows = 4, 3
cell_w = w // cols
cell_h = h // rows
print(f"Trying grid {cols}x{rows}, cell size {cell_w}x{cell_h}")

output_dir = r'C:\Users\kingo\Apps\Essesnshea\website\assets\images\icons'
os.makedirs(output_dir, exist_ok=True)

for r in range(rows):
    for c in range(cols):
        left = c * cell_w
        top = r * cell_h
        right = left + cell_w
        bottom = top + cell_h
        cell = img.crop((left, top, right, bottom))
        # Trim transparent edges
        bbox = cell.getbbox()
        if bbox:
            cell = cell.crop(bbox)
        filename = f'icon_{r}_{c}.png'
        filepath = os.path.join(output_dir, filename)
        cell.save(filepath)
        print(f"  Saved {filename} ({cell.size})")

print("\nDone!")