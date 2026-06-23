import os
import json
import urllib.request

URL = "https://clojuredocs.org/clojuredocs-export.json"
OUTPUT_FILE = "clojuredocs-export.json"

def download_data():
    print(f"Downloading data from {URL}...")
    try:
        with urllib.request.urlopen(URL) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        # Save pretty printed JSON
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Successfully saved export to {OUTPUT_FILE}")
        return data
    except Exception as e:
        print(f"Error downloading data: {e}")
        return None

def analyze_data(data):
    if not data:
        print("No data to analyze.")
        return

    # ClojureDocs JSON has top-level keys like "vars"
    print("\n--- ClojureDocs Export Analysis ---")
    print(f"Root keys: {list(data.keys())}")
    
    if "vars" in data:
        vars_list = data["vars"]
        print(f"Total number of vars: {len(vars_list)}")
        
        # Collect namespaces
        namespaces = set()
        for v in vars_list:
            namespaces.add(v.get("ns"))
            
        print(f"Number of namespaces: {len(namespaces)}")
        print("Namespaces found:")
        for ns in sorted(list(namespaces))[:20]: # Show first 20
            print(f"  - {ns}")
        if len(namespaces) > 20:
            print("  - ...")
            
        # Display sample var structure
        if vars_list:
            print("\nSample Var Structure (first element):")
            sample = vars_list[0]
            print(json.dumps(sample, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    data = download_data()
    analyze_data(data)
