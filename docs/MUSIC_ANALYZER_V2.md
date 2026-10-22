# Music Analyzer V2 — isolated experiment

Base: `4350f7461033c6771a27f9e5bfdea2ce52b99cb6`. V1 remains the default and retains its existing multi-stage pipeline and authorization. No migration or production configuration change is required.

## Execution contract

V2 runs local Essentia, then a dedicated authenticated endpoint, then exactly one selected audio-provider dispatch. That dispatch receives the actual audio and bounded Essentia measurements and returns the complete existing final report schema. There is no synthesis, guard, research, final judge, repair, retry, or model fallback in this path. Legacy DSP is not substituted for failed Essentia.

The existing durable auxiliary admission, provider-start boundary and usage accounting are reused. V1/V2 keys have distinct namespaces. Completed replay does not dispatch again; mismatched audio/model replay is rejected. Failed or uncertain V2 requests retain their browser key. An explicit new-request action warns that an earlier request may still finish and incur usage; it never deletes durable claims or claims to cancel the provider. A restored running browser snapshot becomes a recoverable state, not an indefinite spinner.

Optional V2 provenance is added only at the saved-result boundary, using existing JSON columns. Original model-generation schemas and old saved records remain compatible. Provenance identifies the selected provider/model, successful Essentia stage, one dispatch and returned token usage. Pricing remains governed by existing server accounting; no live cost or musical-quality claim has been verified.

## Reviewed compatibility

| Transport/model                                                 | V2              | Output ceiling | Audio                                                       |
| --------------------------------------------------------------- | --------------- | -------------- | ----------------------------------------------------------- |
| Native Gemini 3.8 Flash, 3.1 Pro Preview, 4 Argon               | Enabled         | 32,768 tokens  | Existing supported MIME types, subject to inline body limit |
| Native GPT Audio 1.5                                            | Enabled         | 16,384 tokens  | MP3/WAV                                                     |
| OpenRouter `openai/gpt-audio`, `openai/gpt-audio-1.5`           | Enabled         | 16,384 tokens  | MP3/WAV; provider fallback disabled                         |
| Other installed extras, including unreviewed NVIDIA/Omni routes | Disabled for V2 | Unverified     | Requires a reviewed one-call audio/output contract          |

Disabled means **not verified for this experiment**, not a claim that the underlying model can never support it. No model is silently replaced. Gemini uses native JSON schema; GPT Audio uses a strict textual JSON contract because its documented structured-output support is absent. Every response is validated locally without repair.

The existing 15 MiB decoded upload cap remains. Gemini additionally rejects encoded inline request bodies over 20 MB before starting a provider attempt; some files below 15 MiB therefore need compression. Full reports have a larger output allowance than ordinary Stage A and can cost more than one Stage A call.

Official transport references:

- [OpenAI audio inputs](https://developers.openai.com/api/docs/guides/audio-chat-completions)
- [GPT Audio 1.5 limits and supported features](https://developers.openai.com/api/docs/models/gpt-audio-1.5)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter audio](https://openrouter.ai/docs/guides/overview/multimodal/audio)

## Handoff and UI

The top accessible version selector is disabled while work is active. V2 hides final-model/reference inputs and labels its result truthfully. Save, Library, copying and the existing session-storage Generator handoff remain in use.

V2 handoff whitelists supported musical fields. Theme/Core Idea and Language are never assigned. Empty or explicitly uncertain values do not clear current choices; low-confidence BPM is not manufactured from a range. Production/instructions are bounded to the Generator's 2,000-character limits and structure to 600 characters. Blueprint section scaffolding uses existing helpers rather than inventing narrative content.

## Verification and manual acceptance

Offline tests count actual mocked transport calls for Gemini/OpenAI/OpenRouter; cover full schema, real audio payload inclusion, Essentia-only evidence, provider errors and limits, duplicate/replay, authorization, V1 routing, version safety, restored browser state and fresh/already-filled Generator handoff. No credentials or paid requests are used. The timestamp regression's two whitespace-sensitive source assertions were converted to equivalent whitespace-independent expressions after Prettier reflow; behavior assertions remain intact.

Before approving real paid comparison testing, an authorized admin should:

1. Analyze the same MP3 with V1 and V2 and the same audio model. Confirm V1 still uses its original final-model flow and V2 reports one selected model.
2. Check every detailed report field, uncertainty, saved Library result and export/copy behavior.
3. Send both a fresh and saved V2 result to Generator with Theme and Language already populated; confirm both remain identical and musical fields populate appropriately.
4. Exercise refresh, repeated submit, an unsupported model/format, a failed request and explicit new request. Confirm there is no automatic second dispatch or false cancellation.
5. Check narrow mobile layout, keyboard operation and focus visibility.

Offline tests establish technical contracts, not live provider JSON reliability or musical-analysis quality. Those require separately authorized paid trials. No merge or deploy is authorized by this experiment.
