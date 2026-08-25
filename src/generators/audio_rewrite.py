import re

text = """[VOICE_A]: Hola como estas?
[VOICE_B]: Muy bien, y tu?
[VOICE_A]: Todo excelente."""

# We want to split this into segments.
# Regex to match [VOICE_A] or [VOICE_B]
segments = re.split(r'(\[VOICE_[AB]\]:?)', text)
print(segments)
