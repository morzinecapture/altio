import Stripe from 'npm:stripe@23.0.0'

// Connect is versioned independently of the existing PaymentIntent integration.
export const connectStripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2026-09-30.endive',
  httpClient: Stripe.createFetchHttpClient(),
  maxNetworkRetries: 2,
  timeout: 20_000,
})
