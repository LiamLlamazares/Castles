import os

def process_wizard():
    source_path = r"c:\Users\liaml\Documents\GitHub\Castles\src\Assets\Images\Chess\wMage.svg"
    w_dest_path = r"c:\Users\liaml\Documents\GitHub\Castles\src\Assets\Images\Chess\wWizard.svg"
    b_dest_path = r"c:\Users\liaml\Documents\GitHub\Castles\src\Assets\Images\Chess\bWizard.svg"

    try:
        with open(source_path, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {source_path} not found.")
        return

    # Create White Wizard
    # Original has fill="#000000" stroke="none" (or implied)
    # We want fill="#ffffff" stroke="#000000" stroke-width="10" (approx)
    
    # We'll replace the group style
    w_content = content.replace('fill="#000000" stroke="none"', 'fill="#ffffff" stroke="#000000" stroke-width="10"')
    
    with open(w_dest_path, 'w') as f:
        f.write(w_content)
    print(f"Created {w_dest_path}")

    # Create Black Wizard
    # We want fill="#000000" stroke="#ffffff" stroke-width="10"
    b_content = content.replace('fill="#000000" stroke="none"', 'fill="#000000" stroke="#ffffff" stroke-width="10"')
    
    with open(b_dest_path, 'w') as f:
        f.write(b_content)
    print(f"Created {b_dest_path}")

if __name__ == "__main__":
    process_wizard()
