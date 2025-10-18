import { useEffect, useRef, useState } from 'react'
import './App.css'
import { FaMicrophoneAlt } from "react-icons/fa";

export default function App() {
  const [status, setStatus] = useState('Tap on mic to speak then hit GO !')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const textInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const [speaking, setSpeaking] = useState(false)

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
      setStatus('Tap again on mic to speak...')
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
        utter.onstart = () => setSpeaking(true)
        utter.onend = () => setSpeaking(false)
        utter.onerror = () => setSpeaking(false)
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utter)
      }
    } catch (e) {
      setResponse(`Request failed: ${e.message}`)
    }
  }

  return (
    <div className="container">
      <h1>AI Voice Assistant</h1>

      {/* text box */}
      <div className="textBox">
        <div className="panelAssistant">
          <span className="assistant-text">Result:</span>
          <div className="text">{response}</div>
        </div>
        <div className="panelUser">
          <span className="status">{status}</span>
          <div className="text">{transcript}</div>
        </div>
      </div>

      {/* result box */}
      <div className="controls">
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
          if (speaking) {
            window.speechSynthesis.cancel()
            setSpeaking(false)
            return
          }
          if (recognitionRef.current && listening) {
            recognitionRef.current.stop()
            const prompt = transcript.trim()
            if (prompt) generateReply(prompt)
          }
        }}
          disabled={!listening && !speaking}
        >
          {speaking ? 'Stop' : listening ? 'GO' : 'GO'}
        </button>
        <div className="typeBox">
          <textarea
            className="input"
            ref={textInputRef}
            rows={1}
            cols={89}
            placeholder="Type here to search..."
          >
          </textarea>
          <button onClick={() => {
            const prompt = textInputRef.current?.value?.trim()
            if (!prompt) return
            setTranscript(prompt)
            textInputRef.current.value = ''
            generateReply(prompt)
          }}>Search</button>
        </div>
      </div>


    </div>
  )
}
