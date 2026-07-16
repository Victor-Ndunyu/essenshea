from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
source_dir = root / "Essenshea_Catalogue"
out_file = root / "website" / "data" / "catalog.json"


def create_slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"&", " and ", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"(^-|-$)", "", value)


def parse_product_section(section: str, category_dir: Path, default_image: str) -> dict:
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    if not lines or not lines[0].startswith("## "):
        return None

    product_name = lines[0][3:].strip()
    image = ""
    description_lines = []

    for line in lines[1:]:
        if line.startswith("![") and "(" in line and ")" in line:
            match = re.search(r"\((.*?)\)", line)
            if match:
                image_path = match.group(1).strip()
                image = f"../Essenshea_Catalogue/{category_dir.name}/{image_path}".replace("\\", "/")
        else:
            description_lines.append(line)

    # Extract stock info from description lines
    stock_value = None
    for index in range(len(description_lines) - 1, -1, -1):
        line = description_lines[index]
        stock_match = re.search(r"(?:Stock|In stock|Quantity):\s*(\d+)", line, re.IGNORECASE)
        if stock_match:
            stock_value = int(stock_match.group(1))
            del description_lines[index]
            break

    # Extract price info from description lines
    price_text = ""
    price_value = None
    for index in range(len(description_lines) - 1, -1, -1):
        line = description_lines[index]
        if re.search(r"\bKES\s*[\d,]+(?:\.\d{2})?\b", line, re.IGNORECASE):
            price_text = line
            del description_lines[index]
            break
        if re.search(r"\bPrice\s+on\s+request\b", line, re.IGNORECASE):
            price_text = "Price on request"
            del description_lines[index]
            break

    # Build final description from remaining lines
    description = " ".join(description_lines).strip()
    description = re.sub(r"\s+", " ", description)
    if not description:
        description = "A premium Essenshea product crafted for ritual and wellness."

    if price_text:
        match = re.search(r"KES\s*([\d,]+(?:\.\d{2})?)", price_text, re.IGNORECASE)
        if match:
            price_value = float(match.group(1).replace(",", ""))
    else:
        price_text = "Price on request"

    if not image:
        image = default_image

    return {
        "name": product_name,
        "slug": create_slug(product_name),
        "image": image,
        "description": description,
        "price": price_text,
        "priceValue": price_value,
        "stock": stock_value,
    }


categories = []

for category_dir in sorted(source_dir.iterdir()):
    if not category_dir.is_dir():
        continue

    md_files = sorted(category_dir.glob("*.md"))
    if not md_files:
        continue

    md_path = md_files[0]
    text = md_path.read_text(encoding="utf-8")
    sections = [section.strip() for section in re.split(r"\n-{3,}\s*\n", text) if section.strip()]

    title = ""
    description = ""
    products = []

    if sections:
        header_lines = [line.strip() for line in sections[0].splitlines() if line.strip()]
        for line in header_lines:
            if line.startswith("# "):
                title = line[2:].strip()
            elif line.startswith("**Description:**"):
                description = line.replace("**Description:**", "").strip()

    if not title:
        title = category_dir.name.replace("_", " ")
    if not description:
        description = "Natural beauty essentials crafted for ritual, wellness and gifting."

    image_dir = category_dir / "images"
    image_files = sorted(image_dir.glob("*")) if image_dir.exists() else []
    default_image = ""
    if image_files:
        default_image = f"../Essenshea_Catalogue/{category_dir.name}/images/{image_files[0].name}".replace("\\", "/")

    for section in sections[1:]:
        product = parse_product_section(section, category_dir, default_image)
        if product:
            products.append(product)

    categories.append({
        "title": title,
        "slug": create_slug(title),
        "description": description,
        "items": len(products),
        "tag": "Curated collection",
        "image": default_image,
        "products": products,
    })

payload = {"categories": categories}
out_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(f"Wrote {out_file}")
