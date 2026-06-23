import os
import json
import sqlite3
import hashlib
import time
import re
from openai import OpenAI

# Configuration
INPUT_FILE = "clojuredocs-export.json"
OUTPUT_FILE = "clojuredocs-translated.json"
CACHE_DB = "translation_cache.db"
TARGET_NAMESPACES = ["clojure.core", "clojure.string", "clojure.set"]
DEFAULT_DELAY = 0.2  # OpenRouter has much higher RPM, 0.2s is fast and safe

# Read OpenRouter / OpenAI credentials from .env
def get_env_config():
    config = {
        "api_key": None,
        "base_url": "https://openrouter.ai/api/v1",
        "model": "deepseek/deepseek-v4-flash"
    }
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    if key == "OPENAI_API_KEY":
                        config["api_key"] = val
                    elif key == "OPENAI_BASE_URL":
                        config["base_url"] = val
                    elif key == "OPENAI_MODEL":
                        config["model"] = val
    
    # Fallback to os.environ
    if not config["api_key"]:
        config["api_key"] = os.environ.get("OPENAI_API_KEY")
    if os.environ.get("OPENAI_BASE_URL"):
        config["base_url"] = os.environ.get("OPENAI_BASE_URL")
    if os.environ.get("OPENAI_MODEL"):
        config["model"] = os.environ.get("OPENAI_MODEL")
        
    return config

config = get_env_config()
if not config["api_key"]:
    raise ValueError("API Key not found. Please set OPENAI_API_KEY in .env or environment variables.")

# Initialize OpenAI Client (OpenRouter compatible)
client = OpenAI(
    api_key=config["api_key"],
    base_url=config["base_url"]
)
MODEL_NAME = config["model"]
print(f"Initialized client with base_url: {config['base_url']} and model: {MODEL_NAME}")

# SQLite Cache Helper
class TranslationCache:
    def __init__(self, db_path=CACHE_DB):
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.cursor.execute(
            "CREATE TABLE IF NOT EXISTS cache (key_hash TEXT PRIMARY KEY, original_text TEXT, translated_text TEXT)"
        )
        self.conn.commit()

    def _get_hash(self, text):
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def get(self, text):
        if not text:
            return ""
        h = self._get_hash(text)
        self.cursor.execute("SELECT translated_text FROM cache WHERE key_hash=?", (h,))
        row = self.cursor.fetchone()
        return row[0] if row else None

    def set(self, text, translated_text):
        if not text:
            return
        h = self._get_hash(text)
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO cache (key_hash, original_text, translated_text) VALUES (?, ?, ?)",
                (h, text, translated_text)
            )
            self.conn.commit()
        except Exception as e:
            print(f"Cache write error: {e}")

    def close(self):
        self.conn.close()

cache = TranslationCache()

def call_llm_with_retry(prompt, max_retries=5):
    delay = 5
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1500
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "limit" in err_str.lower() or "503" in err_str
            if is_rate_limit and attempt < max_retries - 1:
                print(f"  [Rate Limit] {err_str[:100]}... Retrying in {delay}s...")
                time.sleep(delay)
                delay *= 2
            else:
                print(f"  [Error] Failed to translate: {e}")
                raise e
    return None

def translate_docstring(text):
    if not text:
        return ""
    cached = cache.get(text)
    if cached is not None:
        return cached

    prompt = f"""You are a professional software translator specializing in the Clojure programming language.
Translate the following Clojure documentation string (Docstring) into natural, clear, and grammatically correct Korean.

Guidelines:
1. Preserve all markdown formatting (bold, italic, code blocks, lists, links).
2. Keep Clojure code, function names (e.g. 'map', 'filter', 'defn', 'let'), keywords (e.g. ':key'), symbols, and parameter names exactly as they are in English.
3. Translate technical terms accurately (e.g., 'lazy sequence' -> '지연 평가 시퀀스', 'immutable' -> '불변성', 'evaluate' -> '평가하다', 'arity' -> '인자 개수(arity)').
4. Use a professional, polite, and helpful tone (e.g. '~합니다', '~입니다', '~하십시오').
5. Output ONLY the translated Korean text. Do not include any introductions, explanations, or quotes.

Text to translate:
\"\"\"
{text}
\"\"\"
"""
    try:
        translated = call_llm_with_retry(prompt)
        if translated:
            cache.set(text, translated)
            return translated
    except Exception:
        pass
    return text  # Fallback to original text on error

def translate_example_comments(text):
    if not text:
        return ""
    
    # Check if there are actually comments in the example to save API calls
    if not re.search(r';', text):
        return text

    cached = cache.get(text)
    if cached is not None:
        return cached

    prompt = f"""You are a professional Clojure developer and translator.
Below is a Clojure code snippet (often containing interactive REPL sessions or code examples) with comments in English.
Translate the English comments inside this Clojure code snippet into Korean.
Do NOT change any Clojure code lines, REPL prompts (e.g., 'user=>', 'user>'), or code symbols. Translate only the comments starting with semicolons (`;`).

Guidelines:
1. Keep the overall code layout, indentation, and structure exactly the same.
2. Only translate the English words inside comments (e.g. change '; This assigns x to 10' to '; x를 10에 할당합니다').
3. Keep Clojure code, function names, and technical terms in code unchanged.
4. Output ONLY the resulting Clojure code snippet (including the translated comments). Do not include any explanations or quotes.

Snippet to translate:
\"\"\"
{text}
\"\"\"
"""
    try:
        translated = call_llm_with_retry(prompt)
        if translated:
            # Clean markdown code block wraps if LLM mistakenly wrapped them
            if translated.startswith("```"):
                lines = translated.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                translated = "\n".join(lines).strip()

            cache.set(text, translated)
            return translated
    except Exception:
        pass
    return text

def run_translation(test_mode=True, limit=5):
    if not os.path.exists(INPUT_FILE):
        print(f"Input file {INPUT_FILE} not found. Run fetch_data.py first.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    vars_list = data.get("vars", [])
    filtered_vars = vars_list  # Translate all namespaces
    
    print(f"Total vars in export: {len(filtered_vars)}")
    if test_mode:
        print(f"Running in TEST MODE. Only translating first {limit} vars.")
        filtered_vars = filtered_vars[:limit]

    count = 0
    total = len(filtered_vars)

    for v in filtered_vars:
        count += 1
        name = v.get("name")
        ns = v.get("ns")
        print(f"[{count}/{total}] Translating {ns}/{name}...")
        
        # 1. Translate docstring
        if "doc" in v and v["doc"]:
            old_doc = v["doc"]
            v["doc"] = translate_docstring(v["doc"])
            # Sleep only if we actually hit the API (i.e. not cached)
            if cache.get(old_doc) == old_doc: # Meaning fallback occurred or it was not cached properly
                pass
            else:
                time.sleep(DEFAULT_DELAY)
            
        # 2. Translate example comments
        if "examples" in v and v["examples"]:
            for ex in v["examples"]:
                if "body" in ex and ex["body"]:
                    old_body = ex["body"]
                    ex["body"] = translate_example_comments(ex["body"])
                    if cache.get(old_body) != old_body and re.search(r';', old_body):
                        time.sleep(DEFAULT_DELAY)
                    
    # Save translated data
    out_data = {
        "created-at": data.get("created-at"),
        "description": data.get("description"),
        "vars": filtered_vars if test_mode else vars_list # In test mode, we only save the tested subset to a temp file
    }
    
    out_filename = f"test-{OUTPUT_FILE}" if test_mode else OUTPUT_FILE
    with open(out_filename, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)
        
    print(f"Saved translated content to {out_filename}")

if __name__ == "__main__":
    import sys
    test_mode = "--all" not in sys.argv
    run_translation(test_mode=test_mode, limit=5)
    cache.close()
