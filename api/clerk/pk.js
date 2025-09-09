export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    pk: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || null
  });
}
