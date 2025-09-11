// viršuje, prie detektorių:
const has = (k) => !!(process.env[k] || '');
const isTogetherModel = m => /meta-llama|llama/i.test(m); // Together palaiko meta-llama

// ... Anthropic – pataisyta "thinking"
if (isAnthropic(model)) {
  const body = {
    model, max_tokens: maxTok, stream:true,
    messages: [{ role:'user', content: message }]
  };
  if (thinking==='1' || thinking==='true') {
    body.thinking = { type: 'enabled', budget_tokens: 2048 };
  }
  // ...
}

// ... OpenAI – pataisyti parametrai
if (isOpenAI(model)) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${process.env.OPENAI_API_KEY||''}`
    },
    body: JSON.stringify({
      model, stream:true,
      messages:[{role:'user', content:message}],
      // svarbu: naujas parametras
      max_completion_tokens: maxTok
    })
  });
  // ...
}

// --- Llama / Paule: Together **arba** OpenRouter (auto)
if (isOpenRouter(model) || isTogetherModel(model)) {
  const hasOR = has('OPENROUTER_API_KEY');
  const hasTG = has('TOGETHER_API_KEY');

  if (!hasOR && hasTG) {
    // Together
    const resp = await fetch('https://api.together.xyz/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${process.env.TOGETHER_API_KEY||''}`
      },
      body: JSON.stringify({
        model, stream:true,
        messages:[{role:'user', content:message}],
        max_tokens: maxTok
      })
    });
    if (!resp.ok){
      const txt=await resp.text().catch(()=>String(resp.status));
      write(sse.event('error',{message:`Together HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
    }
    const reader=resp.body.getReader(); let buf='';
    for(;;){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\n\n'))>=0){
        const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
        if(!frame) continue;
        const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
        if(!dataLine) continue;
        const data=dataLine.replace(/^data:\s*/,'').trim();
        if (data==='[DONE]'){ write(sse.done()); return close(); }
        try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
      }
    }
    write(sse.done()); return close();
  } else {
    // OpenRouter (pagal seną kelią)
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${process.env.OPENROUTER_API_KEY||''}`,
        'HTTP-Referer': (process.env.SITE_URL||'https://paule.app'),
        'X-Title': 'Paule'
      },
      body: JSON.stringify({
        model, stream:true,
        messages:[{role:'user', content:message}],
        max_tokens:maxTok
      })
    });
    if (!resp.ok){
      const txt=await resp.text().catch(()=>String(resp.status));
      write(sse.event('error',{message:`OpenRouter HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
    }
    const reader=resp.body.getReader(); let buf='';
    for(;;){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\n\n'))>=0){
        const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
        if(!frame) continue;
        const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
        if(!dataLine) continue;
        const data=dataLine.replace(/^data:\s*/,'').trim();
        if (data==='[DONE]'){ write(sse.done()); return close(); }
        try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
      }
    }
    write(sse.done()); return close();
  }
}
