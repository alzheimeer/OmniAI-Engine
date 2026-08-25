const text = `[VOICE_A]: Hola como estas?
[VOICE_B]: Muy bien, y tu?
[VOICE_A]: Todo excelente.`;

const segments = text.split(/(?=\[VOICE_[AB]\]:?)/g);
console.log(segments);
