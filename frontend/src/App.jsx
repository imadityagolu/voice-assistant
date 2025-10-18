import { useEffect, useRef, useState } from 'react'
import './App.css'
import { FaMicrophoneAlt } from "react-icons/fa";

export default function App() {
  const [status, setStatus] = useState('Idle')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const textInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setStatus('SpeechRecognition not supported; use the text box below.')
      return null
    }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = true

    r.onstart = () => setStatus('Listening…')
    r.onend = () => {
      setStatus('Stopped')
      setListening(false)
    }
    r.onerror = (e) => setStatus(`Error: ${e.error}`)
    r.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i]
        const txt = res[0].transcript
        if (res.isFinal) finalTranscriptRef.current += txt + ' '
        else interim += txt
      }
      setTranscript((finalTranscriptRef.current + interim).trim())
    }
    return r
  }

  async function generateReply(prompt) {
    setResponse('Thinking…')
    try {
      const res = await fetch('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      if (data.error) {
        setResponse(`Error: ${data.error}`)
        return
      }
      const text = (data.text || '').trim()
      setResponse(text)

      if ('speechSynthesis' in window && text) {
        const utter = new SpeechSynthesisUtterance(text)
        utter.rate = 1
        utter.pitch = 1
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utter)
      }
    } catch (e) {
      setResponse(`Request failed: ${e.message}`)
    }
  }

  return (
    <div style={{
      width:'900px',
      margin:'0 auto',
      padding:'24px',
      overflow:'auto',
    }}>
      <h1>AI Voice Assistant</h1>

      {/* text box */}
      <div style={{
        marginTop:'16px',
        display:'grid',
        gap:'16px',
      }}>
        <div style={{
          background:'#1e293b',
          borderRadius:'12px',
          padding:'16px',
          minHeight:'340px',
          maxHeight:'350px',
          overflowY:'auto',
        }}>
          <span>Assistant</span>
          <div className="text" style={{overflowY: 'auto'}}>{response}</div>
        </div>
        <div className="panelUser" style={{
          background:'#1e293b',
          borderRadius:'12px',
          padding:'16px',
          minHeight:'120px',
        }}>
          <span>You said</span>
          <div className="text">{transcript}</div>
        </div>
      </div>

      {/* result box */}
      <div style={{
        marginTop:'16px',
        marginBottom:'16px',
        display:'flex',
        gap:'12px',
        alignItems:'center',
      }}>
        <button onClick={() => {
          if (!recognitionRef.current) recognitionRef.current = setupRecognition()
          if (!recognitionRef.current) return
          finalTranscriptRef.current = ''
          setListening(true)
          recognitionRef.current.start()
        }} disabled={listening}>
          <FaMicrophoneAlt />
        </button>
        <button onClick={() => {
          if (recognitionRef.current && listening) recognitionRef.current.stop()
          const prompt = transcript.trim()
          if (prompt) generateReply(prompt)
        }} 
        disabled={!listening}
        >
          GO
        </button>
        <span style={{
          fontSize:'0.95rem',
          color:'#94a3b8'
          }}>{status}</span>
      </div>

      {/* type box */}
      <div style={{
        marginTop:'16px',
        display:'flex',
        gap:'12px',
        alignItems:'flex-start',
      }}>
        <textarea 
        ref={textInputRef} 
        rows={1} 
        placeholder="Type here to search..."
        style={{
          flex:'1',
          padding:'10px',
          borderRadius:'8px',
          border:'1px solid #334155',
          background:'#0b1220',
          color:'#e2e8f0',
        }}
        >
        </textarea>
        <button onClick={() => {
          const prompt = textInputRef.current?.value?.trim()
          if (!prompt) return
          setTranscript(prompt)
          textInputRef.current.value = ''
          generateReply(prompt)
        }}>Ask</button>
      </div>

    </div>
  )
}
