import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './index.css'

// Follow the system theme, including when it changes while the page is open.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme() {
	const root = document.documentElement
	root.classList.toggle('dark', dark.matches)
	root.dataset.theme = dark.matches ? 'dark' : 'light'
}
applyTheme()
dark.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
)
