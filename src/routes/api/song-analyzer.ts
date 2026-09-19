import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";
import { songAnalysisSchema, SONG_ANALYZER_SYSTEM_PROMPT, ANALYZER_MODELS } from "@/lib/song-analyzer";

const MAX_BYTES=50*1024*1024, MAX_REQUEST_BYTES=52*1024*1024;
const MIME=new Set(["audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/aac","audio/ogg","audio/flac","audio/m4a","audio/mp4"]);
const EXT=new Set(["mp3","wav","aac","ogg","flac","m4a"]);
const responseSchema={type:"object",required:["summary","generatorReady","detailedAnalysis","confidenceNotes"],properties:{
 summary:{type:"string"},generatorReady:{type:"object",required:["musicStyle","mood","instruments","bpm","songStructure","productionStyle","additionalInstructions"],properties:{
 musicStyle:{type:"string"},mood:{type:"string"},instruments:{type:"array",items:{type:"object",required:["name","description","confidence"],properties:{name:{type:"string"},description:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]}}}},
 bpm:{type:"object",required:["value","rangeMin","rangeMax","confidence"],properties:{value:{type:["number","null"]},rangeMin:{type:["number","null"]},rangeMax:{type:["number","null"]},confidence:{type:"string",enum:["high","medium","low"]}}},
 songStructure:{type:"array",items:{type:"object",required:["section","description"],properties:{section:{type:"string"},description:{type:"string"}}}},productionStyle:{type:"string"},additionalInstructions:{type:"string"}}},
 detailedAnalysis:{type:"object",required:["genreAndStyle","moodAndEmotion","tempoAndGroove","instrumentation","arrangement","structure","vocals","productionAndMix","energyProgression","notableCharacteristics"],properties:{
 genreAndStyle:{type:"object",required:["primaryGenre","subgenresAndInfluences","description"],properties:{primaryGenre:{type:"string"},subgenresAndInfluences:{type:"array",items:{type:"string"}},description:{type:"string"}}},
 moodAndEmotion:{type:"object",required:["primaryMood","secondaryMoods","emotionalArc"],properties:{primaryMood:{type:"string"},secondaryMoods:{type:"array",items:{type:"string"}},emotionalArc:{type:"string"}}},
 tempoAndGroove:{type:"object",required:["description","meterOrTimeFeel","groove"],properties:{description:{type:"string"},meterOrTimeFeel:{type:["string","null"]},groove:{type:"string"}}},
 instrumentation:{type:"array",items:{type:"object",required:["instrument","role","playingStyle","timbre","confidence"],properties:{instrument:{type:"string"},role:{type:"string"},playingStyle:{type:"string"},timbre:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]}}}},
 arrangement:{type:"string"},structure:{type:"string"},vocals:{type:"object",required:["present","leadVocalDescription","backingVocals","delivery","processing"],properties:{present:{type:"boolean"},leadVocalDescription:{type:["string","null"]},backingVocals:{type:["string","null"]},delivery:{type:["string","null"]},processing:{type:["string","null"]}}},
 productionAndMix:{type:"object",required:["overallCharacter","dynamics","spaceAndStereo","effects","texture"],properties:{overallCharacter:{type:"string"},dynamics:{type:"string"},spaceAndStereo:{type:"string"},effects:{type:"string"},texture:{type:"string"}}},energyProgression:{type:"string"},notableCharacteristics:{type:"array",items:{type:"string"}}}},
 confidenceNotes:{type:"array",items:{type:"object",required:["subject","confidence","note"],properties:{subject:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]},note:{type:"string"}}}}
}};

export const Route=createFileRoute("/api/song-analyzer")({server:{handlers:{POST:async({request})=>{
 const {getUserIdFromRequest}=await import("@/lib/supabase-public.server");
 const userId=await getUserIdFromRequest(request); if(!userId)return Response.json({error:"Unauthorized"},{status:401});
 const len=request.headers.get("content-length"); if(len&&Number(len)>MAX_REQUEST_BYTES)return Response.json({error:"File is larger than 50 MB"},{status:413});
 let form:FormData; try{form=await request.formData();}catch{return Response.json({error:"Invalid upload"},{status:400});}
 const file=form.get("file"), model=String(form.get("model")||"");
 if(!(file instanceof File))return Response.json({error:"No file provided"},{status:400});
 if(!ANALYZER_MODELS.includes(model as never))return Response.json({error:"Model unavailable"},{status:400});
 if(file.size<=0||file.size>MAX_BYTES)return Response.json({error:"File is empty or larger than 50 MB"},{status:413});
 const ext=file.name.split(".").pop()?.toLowerCase()||"", mime=file.type.toLowerCase();
 if(!EXT.has(ext)||!MIME.has(mime))return Response.json({error:"Unsupported audio file"},{status:415});
 const key=process.env["GEMINI_API_KEY"]; if(!key)return Response.json({error:"AI service unavailable"},{status:503});
 const ai=new GoogleGenAI({apiKey:key}); let uploadedName:string|null=null; let usage:any=null; let providerCalled=false;
 try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   const uploaded=await ai.files.upload({file:new Blob([bytes],{type:mime}),config:{mimeType:mime,displayName:"PromptBeats temporary analysis audio"}});
   if(!uploaded.name||!uploaded.uri)throw new Error("Temporary provider upload failed"); uploadedName=uploaded.name;
   providerCalled=true;
   const res=await ai.models.generateContent({model,contents:[{role:"user",parts:[{fileData:{fileUri:uploaded.uri,mimeType:mime}},{text:"Analyze the supplied audio according to the system instruction and return the required structured result."}]}],config:{systemInstruction:SONG_ANALYZER_SYSTEM_PROMPT,responseMimeType:"application/json",responseJsonSchema:responseSchema as never,maxOutputTokens:16384}});
   usage=res.usageMetadata;
   const parsed=songAnalysisSchema.safeParse(JSON.parse(res.text||""));
   const normalized=usage?{inputTokens:usage.promptTokenCount??null,outputTokens:(usage.candidatesTokenCount??0)+(usage.thoughtsTokenCount??0),totalTokens:usage.totalTokenCount??null}:null;
   const {recordAiUsage}=await import("@/lib/ai-usage.server");
   await recordAiUsage({userId,provider:"gemini",model,operation:"song_analysis",usage:normalized,success:parsed.success});
   if(!parsed.success){console.warn("[song-analyzer] schema_validation_error",parsed.error.issues.slice(0,8));return Response.json({error:"The AI returned an invalid structured analysis"},{status:502});}
   return Response.json({analysis:parsed.data,model});
 }catch(err){
   console.error("[song-analyzer] analysis_failed",err);
   if(providerCalled&&!usage){const {recordAiUsage}=await import("@/lib/ai-usage.server");await recordAiUsage({userId,provider:"gemini",model,operation:"song_analysis",usage:null,success:false});}
   return Response.json({error:"Song analysis failed. Please try again."},{status:502});
 }finally{
   if(uploadedName){try{await ai.files.delete({name:uploadedName});console.info("[song-analyzer] temporary Gemini file deleted",uploadedName);}catch(err){console.error("[song-analyzer] TEMP_AUDIO_CLEANUP_FAILED",uploadedName,err);}}
 }
}}}});
