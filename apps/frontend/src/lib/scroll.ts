// The store column scrolls on its own, not the window, so the scrollbar sits
// beside the chat rather than past it.
export const STORE_SCROLLER_ID = 'store'

export function scrollStoreToTop(behavior: ScrollBehavior = 'auto'): void {
	document.getElementById(STORE_SCROLLER_ID)?.scrollTo({ top: 0, behavior })
}
