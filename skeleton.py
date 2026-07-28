import re
import sys
import os

def skeletonize(content):
    # Remove block comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    # Remove line comments
    content = re.sub(r'//.*', '', content)
    
    lines = content.split('\n')
    skeleton = []
    
    in_import = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
            
        # Match imports/exports
        if stripped.startswith('import ') or stripped.startswith('export '):
            skeleton.append(line)
            if not stripped.endswith(';'):
                if '{' in stripped and '}' not in stripped:
                    in_import = True
            continue
            
        if in_import:
            skeleton.append(line)
            if '}' in stripped:
                in_import = False
            continue
            
        # Match signatures
        if re.search(r'^(export )?(default )?(class|interface|type) ', stripped):
            skeleton.append(line)
            continue
            
        if re.search(r'^(export )?(default )?(async )?function ', stripped):
            skeleton.append(line)
            continue
            
        if '=>' in stripped and ('const' in stripped or 'let' in stripped or 'var' in stripped):
            skeleton.append(line)
            continue
            
        if re.search(r'^(const|let|var) ', stripped):
            skeleton.append(line)
            continue
            
        # Closing brackets
        if stripped == '}' or stripped == '};' or stripped == '});':
            skeleton.append(line)
            continue
            
    return '\n'.join(skeleton)

file_list = []
with open('file-list.md', 'r') as f:
    for line in f:
        line = line.strip()
        if line.startswith('- '):
            file_list.append(line[2:])

with open('hcs_relevant-files.md', 'w') as out:
    for filepath in file_list:
        if not os.path.exists(filepath):
            continue
            
        with open(filepath, 'r') as f:
            content = f.read()
            
        out.write(f"### {filepath}\n")
        
        ext = filepath.split('.')[-1]
        if ext in ['ts', 'tsx']:
            lang = 'typescript'
        elif ext == 'js':
            lang = 'javascript'
        else:
            lang = ext
            
        out.write(f"```{lang}\n")
        out.write(skeletonize(content))
        out.write(f"\n```\n\n")
