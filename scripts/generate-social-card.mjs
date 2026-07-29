#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadJson, writeSocialCard } from './lib/social-cards/write-social-card.mjs';
function args(argv){const o={};for(const a of argv){if(a==='--preview')o.preview=true;else if(a.startsWith('--')){const [k,...v]=a.slice(2).split('=');o[k]=v.join('=');}}return o;}
async function main(){const a=args(process.argv.slice(2));if(!a.template)throw new Error('--template is required');if(!a.input)throw new Error('Real-data composite generation is not yet available in this framework branch. Supply --input=<normalized fixture or validated adapter output>. Confirmed real-data mode requires an explicit validated confirmed-values source.');const input=loadJson(path.resolve(a.input));const result=await writeSocialCard({template:a.template,input,outputDir:a['output-dir']??'artifacts/social-cards',preview:Boolean(a.preview),valuesSourceAvailable:a['values-source-unavailable']!=='true'});console.log(JSON.stringify(result,null,2));}
main().catch((e)=>{console.error(e.readiness?JSON.stringify({ready:false,...e.readiness},null,2):e.stack||e.message);process.exitCode=1;});
