import os
import sys
import json

def scan_for_apps(target_dir):
    apps = []
    # Only scan up to a certain depth to prevent hanging on huge drives
    max_depth = 3
    base_depth = target_dir.count(os.sep)

    for root, dirs, files in os.walk(target_dir):
        current_depth = root.count(os.sep)
        if current_depth - base_depth > max_depth:
            del dirs[:] # Don't go deeper
            continue

        for file in files:
            if file.lower().endswith(('.exe', '.bat', '.lnk')):
                apps.append({
                    "name": os.path.splitext(file)[0],
                    "path": os.path.join(root, file)
                })
    
    return apps

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python scanner.py <target_dir>"}))
        sys.exit(1)
        
    target_dir = sys.argv[1]
    
    if not os.path.exists(target_dir):
        print(json.dumps({"error": "Directory does not exist"}))
        sys.exit(1)
        
    try:
        found_apps = scan_for_apps(target_dir)
        print(json.dumps({"apps": found_apps}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
