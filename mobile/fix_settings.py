import re

backend_dir = r"C:\Projects\SafeVoice\backend"
settings_path = backend_dir + "\\core\\settings.py"

with open(settings_path, "r") as f:
    settings = f.read()

settings = settings.replace("}\n}", "}")

with open(settings_path, "w") as f:
    f.write(settings)
