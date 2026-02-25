const supabase = require('../config/db');

// Get user's wallet balance and details
exports.getWalletBalance = async (req, res) => {
  try {
    const user_id = req.user.id;

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error) {
      // If wallet doesn't exist, create one
      if (error.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert([{ user_id, balance: 0.00 }])
          .select()
          .single();

        if (createError) throw createError;

        return res.json({
          success: true,
          data: newWallet
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: wallet
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet balance',
      error: error.message
    });
  }
};

// Get wallet transaction history
exports.getWalletTransactions = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { limit = 50, offset = 0, type, start_date, end_date } = req.query;

    // First get all transactions for this user
    let query = supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (type) {
      query = query.eq('type', type);
    }

    // Add date filtering
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    if (end_date) {
      query = query.lte('created_at', end_date);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;

    // Enrich transactions with order and user details
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        let relatedUser = null;
        
        // If transaction has a reference_id (order), fetch order details to get the other party
        if (transaction.reference_id && (transaction.transaction_type === 'ORDER_PAYMENT' || transaction.transaction_type === 'ORDER_REJECTED_REFUND')) {
          const { data: order } = await supabase
            .from('orders')
            .select('buyer_id, farmer_id, products(name, farmer:users!products_farmer_id_fkey(id, full_name, role))')
            .eq('id', transaction.reference_id)
            .single();

          if (order) {
            // Determine which user to fetch (the other party in the transaction)
            // For CREDIT transactions (received money), show who sent it
            // For DEBIT transactions (sent money), show who received it
            const otherUserId = transaction.type === 'CREDIT' ? order.buyer_id : order.farmer_id;
            
            const { data: user } = await supabase
              .from('users')
              .select('id, full_name, role')
              .eq('id', otherUserId)
              .single();

            relatedUser = user;
            
            // If this is a farmer receiving payment, also include the product farmer info
            if (transaction.type === 'CREDIT' && order.products?.farmer) {
              // For farmers, when they receive money, it's from a customer
              // So we want to show the customer's name
              relatedUser = user; // This is already the buyer
            }
          }
        }

        return {
          ...transaction,
          related_user: relatedUser
        };
      })
    );

    res.json({
      success: true,
      count: enrichedTransactions.length,
      data: enrichedTransactions
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message
    });
  }
};

// Add money to wallet (for now, just simulates adding money)
exports.addMoney = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { amount, payment_method = 'UPI' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (walletError) throw walletError;

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + parseFloat(amount);

    // Update wallet balance
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: balanceAfter })
      .eq('id', wallet.id);

    if (updateError) throw updateError;

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: wallet.id,
        user_id,
        amount: parseFloat(amount),
        type: 'CREDIT',
        transaction_type: 'ADD_MONEY',
        description: 'Added money',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        status: 'COMPLETED'
      }])
      .select()
      .single();

    if (transactionError) throw transactionError;

    res.json({
      success: true,
      message: 'Money added successfully',
      data: {
        transaction,
        newBalance: balanceAfter
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding money',
      error: error.message
    });
  }
};

// Process order payment (called when order is accepted)
exports.processOrderPayment = async (orderId, buyerId, farmerId, amount) => {
  try {
    // Get buyer and farmer names for better descriptions
    const [buyerResult, farmerResult] = await Promise.all([
      supabase.from('users').select('full_name').eq('id', buyerId).single(),
      supabase.from('users').select('full_name').eq('id', farmerId).single()
    ]);

    const buyerName = buyerResult.data?.full_name || 'Customer';
    const farmerName = farmerResult.data?.full_name || 'Farmer';

    // Get or create buyer's wallet
    let { data: buyerWallet, error: buyerWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', buyerId)
      .single();

    if (buyerWalletError) {
      // If wallet doesn't exist, create one
      if (buyerWalletError.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert([{ user_id: buyerId, balance: 0.00 }])
          .select()
          .single();

        if (createError) throw createError;
        buyerWallet = newWallet;
      } else {
        throw buyerWalletError;
      }
    }

    // Get or create farmer's wallet
    let { data: farmerWallet, error: farmerWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', farmerId)
      .single();

    if (farmerWalletError) {
      // If wallet doesn't exist, create one
      if (farmerWalletError.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert([{ user_id: farmerId, balance: 0.00 }])
          .select()
          .single();

        if (createError) throw createError;
        farmerWallet = newWallet;
      } else {
        throw farmerWalletError;
      }
    }

    const buyerBalanceBefore = parseFloat(buyerWallet.balance);
    const farmerBalanceBefore = parseFloat(farmerWallet.balance);
    const paymentAmount = parseFloat(amount);

    // Validate payment amount
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return {
        success: false,
        message: 'Invalid payment amount'
      };
    }

    // Check if buyer has sufficient balance
    if (buyerBalanceBefore < paymentAmount) {
      return {
        success: false,
        message: 'Insufficient wallet balance'
      };
    }

    const buyerBalanceAfter = buyerBalanceBefore - paymentAmount;
    const farmerBalanceAfter = farmerBalanceBefore + paymentAmount;

    // Debit from buyer
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: buyerBalanceAfter })
      .eq('id', buyerWallet.id);

    if (debitError) {
      throw debitError;
    }

    // Credit to farmer
    const { error: creditError } = await supabase
      .from('wallets')
      .update({ balance: farmerBalanceAfter })
      .eq('id', farmerWallet.id);

    if (creditError) {
      throw creditError;
    }

    // Record buyer transaction (debit)
    const { error: buyerTxError } = await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: buyerWallet.id,
        user_id: buyerId,
        amount: paymentAmount,
        type: 'DEBIT',
        transaction_type: 'ORDER_PAYMENT',
        description: `Payment to ${farmerName}`,
        reference_id: orderId,
        balance_before: buyerBalanceBefore,
        balance_after: buyerBalanceAfter,
        status: 'COMPLETED'
      }]);

    if (buyerTxError) {
      throw buyerTxError;
    }

    // Record farmer transaction (credit)
    const { error: farmerTxError } = await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: farmerWallet.id,
        user_id: farmerId,
        amount: paymentAmount,
        type: 'CREDIT',
        transaction_type: 'ORDER_PAYMENT',
        description: `Payment from ${buyerName}`,
        reference_id: orderId,
        balance_before: farmerBalanceBefore,
        balance_after: farmerBalanceAfter,
        status: 'COMPLETED'
      }]);

    if (farmerTxError) {
      throw farmerTxError;
    }

    return {
      success: true,
      message: 'Payment processed successfully'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Payment processing failed',
      error: error.message
    };
  }
};

// Process refund (called when order is rejected)
exports.processRefund = async (orderId, buyerId, farmerId, amount) => {
  try {
    // Get farmer's name for the description
    const { data: farmer } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', farmerId)
      .single();

    const farmerName = farmer?.full_name || 'Farmer';

    // Get buyer's wallet
    const { data: buyerWallet, error: buyerWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', buyerId)
      .single();

    if (buyerWalletError) throw buyerWalletError;

    const buyerBalanceBefore = parseFloat(buyerWallet.balance);
    const refundAmount = parseFloat(amount);
    const buyerBalanceAfter = buyerBalanceBefore + refundAmount;

    // Credit refund to buyer
    await supabase
      .from('wallets')
      .update({ balance: buyerBalanceAfter })
      .eq('id', buyerWallet.id);

    // Record refund transaction
    await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: buyerWallet.id,
        user_id: buyerId,
        amount: refundAmount,
        type: 'CREDIT',
        transaction_type: 'ORDER_REJECTED_REFUND',
        description: `Refund from ${farmerName}`,
        reference_id: orderId,
        balance_before: buyerBalanceBefore,
        balance_after: buyerBalanceAfter,
        status: 'COMPLETED'
      }]);

    return {
      success: true,
      message: 'Refund processed successfully'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Refund processing failed',
      error: error.message
    };
  }
};
