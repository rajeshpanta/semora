// Find JSX elements whose children are TEXT + inline string expressions.
// The localized Text wrapper joins those into ONE string before lookup, so the
// joined form is what must be in the dictionary — translating a fragment does
// nothing. This is how "Nothing pressing — you{'’'}re all caught up." stayed English.
const ts=require('typescript'), fs=require('fs'), path=require('path');
const os=require('os');
// Build the real runtime with the RN deps stubbed (same approach as
// audit-i18n-deep.cjs) so misses are judged by the production lookup.
const work=fs.mkdtempSync(path.join(os.tmpdir(),'i18n-join-'));
fs.writeFileSync(path.join(work,'expo-localization.js'),'exports.getLocales=()=>[{languageCode:"en"}];');
fs.writeFileSync(path.join(work,'appStore.js'),'exports.useAppStore={getState:()=>({languagePreference:"es",setLanguagePreference(){}})};');
const O={compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}};
const R=path.join(__dirname,'..');
fs.writeFileSync(path.join(work,'es.cjs'),ts.transpileModule(fs.readFileSync(path.join(R,'lib/i18n/es.ts'),'utf8'),O).outputText);
fs.writeFileSync(path.join(work,'runtime.cjs'),ts.transpileModule(
  fs.readFileSync(path.join(R,'lib/i18n.ts'),'utf8')
    .replace("from 'expo-localization'",`from '${path.join(work,'expo-localization.js')}'`)
    .replace("from '@/lib/i18n/es'",`from '${path.join(work,'es.cjs')}'`)
    .replace("from '@/store/appStore'",`from '${path.join(work,'appStore.js')}'`),O).outputText);
const {translate}=require(path.join(work,'runtime.cjs'));
const ROOT=path.join(__dirname,'..');
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name.startsWith('.'))continue;
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p); else if(/\.tsx$/.test(e.name))files.push(p);}})(path.join(ROOT,'app'));
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name.startsWith('.'))continue;
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p); else if(/\.tsx$/.test(e.name))files.push(p);}})(path.join(ROOT,'components'));
const out=[];
for(const f of files){
  const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const rel=path.relative(ROOT,f);
  (function visit(n){
    if(ts.isJsxElement(n)){
      const kids=n.children;
      const hasText=kids.some(k=>ts.isJsxText(k)&&k.text.trim());
      const hasStrExpr=kids.some(k=>ts.isJsxExpression(k)&&k.expression&&
        (ts.isStringLiteral(k.expression)||ts.isNoSubstitutionTemplateLiteral(k.expression)));
      if(hasText&&hasStrExpr){
        let joined='';let ok=true;
        for(const k of kids){
          if(ts.isJsxText(k)) joined+=k.text.replace(/\s*\n\s*/g,'');
          else if(ts.isJsxExpression(k)&&k.expression&&
                 (ts.isStringLiteral(k.expression)||ts.isNoSubstitutionTemplateLiteral(k.expression)))
            joined+=k.expression.text;
          else { ok=false; break; }
        }
        joined=joined.trim();
        if(ok&&joined.length>6&&/[a-zA-Z]{3}/.test(joined)&&translate(joined,'es')===joined){
          out.push([joined, `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line+1}`]);
        }
      }
    }
    ts.forEachChild(n,visit);
  })(sf);
}
console.log('joined-JSX strings still untranslated:', out.length);
for(const [s,loc] of out) console.log(`  ${JSON.stringify(s)}  @ ${loc}`);
