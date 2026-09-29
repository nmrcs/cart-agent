import { RouterProvider } from '@heroui/react'
import { useEffect } from 'react'
import {
	Route,
	Routes,
	useHref,
	useLocation,
	useNavigate,
} from 'react-router-dom'
import { AssistantPanel } from './components/AssistantPanel'
import { CartDrawer } from './components/CartDrawer'
import { Header } from './components/Header'
import { api } from './lib/api'
import { STORE_SCROLLER_ID, scrollStoreToTop } from './lib/scroll'
import { useResource } from './lib/use-resource'
import { CatalogScreen } from './screens/CatalogScreen'
import { NotFoundScreen } from './screens/NotFoundScreen'
import { ProductScreen } from './screens/ProductScreen'
import { useAssistant } from './store/assistant'
import { useCart } from './store/cart'

function ScrollToTop() {
	const { pathname } = useLocation()
	useEffect(() => {
		scrollStoreToTop()
	}, [pathname])
	return null
}

export function App() {
	const navigate = useNavigate()
	const loadCart = useCart((s) => s.load)
	const chatOpen = useAssistant((s) => s.isOpen)
	const { data: categories } = useResource('categories', api.categories)

	useEffect(() => {
		void loadCart()
	}, [loadCart])

	const catalog = <CatalogScreen categories={categories ?? []} />
	return (
		// HeroUI links (breadcrumbs) navigate through the router, not a reload.
		<RouterProvider navigate={navigate} useHref={useHref}>
			<ScrollToTop />
			<div className="flex h-dvh">
				<div className="flex min-w-0 flex-1 flex-col">
					<Header />
					{/* Only the store scrolls, below the header, so the scrollbar runs
					    from the header down beside the chat. A container, so the grids
					    answer to the room left beside the chat, not to the window. */}
					<div
						id={STORE_SCROLLER_ID}
						className="@container flex flex-1 flex-col overflow-y-auto"
					>
						<main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6">
							<Routes>
								<Route path="/" element={catalog} />
								<Route path="/category/:slug" element={catalog} />
								<Route path="/product/:slug" element={<ProductScreen />} />
								<Route path="*" element={<NotFoundScreen />} />
							</Routes>
						</main>
						<footer className="border-t border-separator">
							<div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted sm:px-6">
								A demo store. Nothing here is for sale.
							</div>
						</footer>
					</div>
				</div>
				{/* A full-height column beside the store on a wide screen, over the
				    catalog below the header on a narrow one. */}
				{chatOpen && (
					<aside className="fixed inset-x-0 top-16 bottom-0 z-20 lg:static lg:z-auto lg:w-[400px] lg:shrink-0 lg:border-l lg:border-separator">
						<AssistantPanel />
					</aside>
				)}
			</div>
			<CartDrawer />
		</RouterProvider>
	)
}
