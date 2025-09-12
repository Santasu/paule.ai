module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(200).json({ status:'ok' });
    return res.status(200).json({ status:'received' });
  } catch {
    return res.status(200).json({ status:'ok' });
  }
};
