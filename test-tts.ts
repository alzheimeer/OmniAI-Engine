import textToSpeech from '@google-cloud/text-to-speech';
const client = new textToSpeech.TextToSpeechClient();
async function test() {
  const request = {
    input: { text: 'Hola a todos. Hoy hablaremos de inteligencia.' },
    voice: { languageCode: 'es-ES', name: 'es-ES-Journey-D' },
    audioConfig: { audioEncoding: 'MP3' as const },
    enableTimePointing: [textToSpeech.protos.google.cloud.texttospeech.v1.SynthesizeSpeechRequest.TimepointType.SSML_MARK]
  };
  const [response] = await client.synthesizeSpeech(request);
  console.log('Timepoints:', (response as any).timepoints);
}
test().catch(console.error);
