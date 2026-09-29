import { Alert, Button, Drawer, EmptyState } from '@heroui/react'
import { Link } from 'react-router-dom'
import { money } from '../lib/money'
import { useCart } from '../store/cart'
import { TrashIcon } from './Icons'
import { ProductImage } from './ProductImage'
import { QuantityStepper } from './QuantityStepper'

export function CartDrawer() {
	const cart = useCart((s) => s.cart)
	const isOpen = useCart((s) => s.isOpen)
	const setOpen = useCart((s) => s.setOpen)
	const setQuantity = useCart((s) => s.setQuantity)
	const error = useCart((s) => s.error)
	const lines = cart?.lines ?? []

	return (
		<Drawer isOpen={isOpen} onOpenChange={setOpen}>
			<Drawer.Backdrop>
				<Drawer.Content placement="right">
					<Drawer.Dialog className="flex w-full max-w-md flex-col px-0">
						<Drawer.Header className="mx-6 border-b border-separator pb-4">
							<Drawer.Heading className="font-display text-2xl">
								Your cart
							</Drawer.Heading>
							<Drawer.CloseTrigger />
						</Drawer.Header>
						{/* Side padding lives inside the scroller, so the scrollbar sits on the
						    drawer's right edge, not 24px in. */}
						<Drawer.Body className="m-0 flex-1 overflow-y-auto px-6">
							{lines.length === 0 ? (
								<EmptyState className="flex h-full flex-col items-center justify-center gap-3 text-center">
									<p className="font-display text-xl">Nothing here yet</p>
									<p className="max-w-60 text-sm text-muted">
										Add something from the catalog and it will wait for you
										here.
									</p>
								</EmptyState>
							) : (
								<ul className="divide-y divide-separator">
									{lines.map((line) => (
										<li key={line.product.id} className="flex gap-6 py-5">
											<Link
												to={`/product/${line.product.slug}`}
												onClick={() => setOpen(false)}
												className="block shrink-0"
											>
												{/* A fixed square as tall as a two-line name with the
												    stepper under it. Sized from the row's height it came
												    out wider than its column and covered the name. */}
												<ProductImage
													image={line.product.image}
													category={line.product.category.slug}
													className="size-26 rounded-2xl"
												/>
											</Link>
											<div className="flex min-w-0 flex-1 flex-col">
												<div className="flex items-start justify-between gap-3">
													<Link
														to={`/product/${line.product.slug}`}
														onClick={() => setOpen(false)}
														className="line-clamp-2 text-sm leading-snug font-medium text-foreground hover:underline hover:underline-offset-4"
													>
														{line.product.name}
													</Link>
													<span className="tabular shrink-0 text-sm font-semibold">
														{money(line.lineTotalCents)}
													</span>
												</div>
												<span className="tabular mt-1 text-xs text-muted">
													{money(line.product.priceCents)} each
												</span>
												<div className="mt-auto flex items-center justify-between pt-3">
													<QuantityStepper
														slug={line.product.slug}
														name={line.product.name}
														max={line.product.stock}
														size="sm"
													/>
													<Button
														isIconOnly
														size="sm"
														variant="ghost"
														aria-label={`Remove ${line.product.name}`}
														onPress={() =>
															void setQuantity(line.product.slug, 0)
														}
													>
														<TrashIcon className="size-4" />
													</Button>
												</div>
											</div>
										</li>
									))}
								</ul>
							)}
						</Drawer.Body>
						{(lines.length > 0 || error) && (
							<Drawer.Footer className="mx-6 flex flex-col gap-2 border-t border-separator pt-4">
								{error && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Description>{error}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}
								{cart && lines.length > 0 && (
									<>
										{cart.discount && (
											<dl className="flex w-full flex-col gap-1 text-sm">
												<div className="flex items-baseline justify-between">
													<dt className="text-muted">Subtotal</dt>
													<dd className="tabular">
														{money(cart.subtotalCents)}
													</dd>
												</div>
												<div className="flex items-baseline justify-between">
													<dt className="text-muted">
														{cart.discount.label}, {cart.discount.percent}%
													</dt>
													<dd className="tabular font-medium text-success">
														−{money(cart.discount.amountCents)}
													</dd>
												</div>
											</dl>
										)}
										<div className="flex w-full items-baseline justify-between">
											<span className="text-muted">
												{cart.itemCount}{' '}
												{cart.itemCount === 1 ? 'item' : 'items'}
											</span>
											<span className="tabular text-xl font-semibold">
												{money(cart.totalCents)}
											</span>
										</div>
										<p className="w-full text-xs text-muted">
											Prices and the total are checked against the catalog on
											every change.
										</p>
									</>
								)}
							</Drawer.Footer>
						)}
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	)
}
