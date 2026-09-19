import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { songAnalysisSchema, ANALYZER_MODELS, ANALYZER_SCHEMA_VERSION } from "@/lib/song-analyzer";

export const listSongAnalyses=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data,error}=await context.supabase.from("song_analyses" as never).select("*").order("created_at",{ascending:false}); if(error)throw new Error(error.message); return {analyses:data??[]};
});
export const saveSongAnalysis=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({
 projectId:z.string().uuid(),name:z.string().trim().min(1).max(200),model:z.enum(ANALYZER_MODELS),analysis:songAnalysisSchema
}).parse(v)).handler(async({data,context})=>{
 const {error}=await context.supabase.from("song_analyses" as never).insert({user_id:context.userId,project_id:data.projectId,name:data.name,model:data.model,summary:data.analysis.summary,generator_ready:data.analysis.generatorReady,detailed_analysis:data.analysis.detailedAnalysis,confidence_notes:data.analysis.confidenceNotes,analysis_schema_version:ANALYZER_SCHEMA_VERSION} as never);
 if(error)throw new Error(error.message); return {ok:true};
});
