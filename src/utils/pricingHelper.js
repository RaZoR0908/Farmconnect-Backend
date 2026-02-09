// Calculate price based on buyer role
exports.calculatePrice = (basePrice, buyerRole, quantity = 0) => {
  const discounts = {
    'CUSTOMER': 0,
    'RETAILER': 10,
    'WHOLESALER': 20,
    'INSTITUTIONAL_BUYER': 25
  };

  const discountPercent = discounts[buyerRole] || 0;
  const discountedPrice = basePrice * (1 - discountPercent / 100);

  return {
    basePrice: parseFloat(basePrice),
    discountPercent,
    finalPrice: parseFloat(discountedPrice.toFixed(2)),
    savings: parseFloat((basePrice - discountedPrice).toFixed(2))
  };
};
