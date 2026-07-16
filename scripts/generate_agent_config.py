from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
env_paths = [root / '.env', root / '.env.local']
out_path = root / 'website' / 'assets' / 'js' / 'agent-config.js'

config = {
    'brainProvider': 'google',
    'apiUrl': 'http://localhost:3000/api/agent',
    'model': 'google/gemini-2.5-flash',
    'fallbackModel': 'groq/llama-3.3-70b-versatile',
    'telegramWebhookUrl': '',
    'allowStockEdits': True,
    'stockEditScope': 'stock-only',
    'siteInfoAccess': 'full',
}

for env_path in env_paths:
    if not env_path.exists():
        continue

    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if key == 'AGENT_API_URL':
            config['apiUrl'] = value
        elif key == 'AGENT_PROVIDER' and value:
            config['brainProvider'] = value
        elif key == 'AGENT_MODEL' and value:
            config['model'] = value
        elif key == 'AGENT_FALLBACK_MODEL' and value:
            config['fallbackModel'] = value
        elif key == 'TELEGRAM_WEBHOOK_URL':
            config['telegramWebhookUrl'] = value
        elif key == 'STOCK_EDIT_SCOPE' and value:
            config['stockEditScope'] = value

out_template = f"window.AGENT_CONFIG = {json.dumps(config, indent=2)};\n"
out_path.write_text(out_template, encoding='utf-8')
print(f'Wrote agent config to {out_path}')
