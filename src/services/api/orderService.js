import ordersData from "../mockData/orders.json";
import React from "react";
import Error from "@/components/ui/Error";
import { paymentService } from "@/services/api/paymentService";

class OrderService {
  constructor() {
    this.orders = [...ordersData];
  }

  async getAll() {
    await this.delay();
    return [...this.orders];
  }

async getById(id) {
    await this.delay();
    const order = this.orders.find(o => o.id === id);
    if (!order) {
      throw new Error('Order not found');
    }
    return { ...order };
  }

  async create(orderData) {
    await this.delay();
    // Validate payment data
    if (orderData.paymentMethod && orderData.paymentMethod !== 'cash') {
      if (!orderData.paymentResult && orderData.paymentMethod !== 'wallet') {
        throw new Error('Payment result is required for non-cash payments');
      }
    }
    
const newOrder = {
      id: this.getNextId(),
      ...orderData,
      // Preserve user-provided transaction ID over payment result transaction ID
      transactionId: orderData.transactionId || orderData.paymentResult?.transactionId || null,
      paymentStatus: orderData.paymentStatus || (orderData.paymentMethod === 'cash' ? 'pending' : 'completed'),
      // Ensure both total and totalAmount fields are set for compatibility
      total: orderData.total || orderData.totalAmount || 0,
      totalAmount: orderData.totalAmount || orderData.total || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Handle wallet payments
if (orderData.paymentMethod === 'wallet') {
      try {
        const walletTransaction = await paymentService.processWalletPayment(orderData.total, newOrder.id);
        newOrder.paymentResult = walletTransaction;
        newOrder.paymentStatus = 'completed';
      } catch (walletError) {
        throw new Error('Wallet payment failed: ' + walletError.message);
      }
    }
    
// Handle bank transfer verification
    if (orderData.paymentMethod === 'bank' && orderData.paymentResult?.requiresVerification) {
      newOrder.paymentStatus = 'pending_verification';
      newOrder.status = 'payment_pending';
    }
    
    // Handle payment proof submissions
    if (orderData.paymentProof && orderData.paymentMethod === 'bank') {
      newOrder.verificationStatus = 'pending';
      newOrder.paymentProofSubmittedAt = new Date().toISOString();
    }
    
    this.orders.push(newOrder);
    return { ...newOrder };
  }

  async update(id, orderData) {
    await this.delay();
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) {
      throw new Error('Order not found');
    }
    this.orders[index] = { ...this.orders[index], ...orderData };
    return { ...this.orders[index] };
  }

  async delete(id) {
    await this.delay();
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) {
      throw new Error('Order not found');
    }
this.orders.splice(index, 1);
    return true;
  }

  getNextId() {
    const maxId = this.orders.reduce((max, order) => 
      order.id > max ? order.id : max, 0);
    return maxId + 1;
  }
  async assignDeliveryPersonnel(orderId, deliveryPersonId) {
    await this.delay();
    const order = await this.getById(orderId);
    const updatedOrder = {
      ...order,
      deliveryPersonId: deliveryPersonId,
      deliveryStatus: 'assigned'
    };
    return await this.update(orderId, updatedOrder);
  }
  async updateDeliveryStatus(orderId, deliveryStatus, actualDelivery = null) {
    await this.delay();
    const order = await this.getById(orderId);
    const updatedOrder = {
      ...order,
      deliveryStatus,
      ...(actualDelivery && { actualDelivery })
    };
    return await this.update(orderId, updatedOrder);
  }

  async getOrdersByDeliveryPerson(deliveryPersonId) {
    await this.delay();
    return this.orders.filter(order => order.deliveryPersonId === deliveryPersonId);
  }

  async getOrdersByDeliveryStatus(deliveryStatus) {
return this.orders.filter(order => order.deliveryStatus === deliveryStatus);
  }

// Payment Integration Methods
  async updatePaymentStatus(orderId, paymentStatus, paymentResult = null) {
    await this.delay();
    const order = await this.getById(orderId);
    const updatedOrder = {
      ...order,
      paymentStatus,
      paymentResult,
      updatedAt: new Date().toISOString(),
      ...(paymentStatus === 'completed' && { paidAt: new Date().toISOString() }),
      ...(paymentStatus === 'completed' && order.status === 'payment_pending' && { status: 'confirmed' })
    };
    return await this.update(orderId, updatedOrder);
  }

  async getOrdersByPaymentStatus(paymentStatus) {
    await this.delay();
    return this.orders.filter(order => order.paymentStatus === paymentStatus);
  }

  async getOrdersByPaymentMethod(paymentMethod) {
    await this.delay();
    return this.orders.filter(order => order.paymentMethod === paymentMethod);
  }

  async verifyOrderPayment(orderId, verificationData) {
    await this.delay();
    const order = await this.getById(orderId);
    
    if (order.paymentStatus !== 'pending_verification') {
      throw new Error('Order payment does not require verification');
    }
    
    try {
      const verificationResult = await paymentService.verifyPayment(
        order.paymentResult.transactionId, 
        verificationData
      );
      
      if (verificationResult.verified) {
        const updatedOrder = await this.updatePaymentStatus(orderId, 'completed', verificationResult.transaction);
        return updatedOrder;
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error) {
      throw new Error('Payment verification error: ' + error.message);
    }
  }

  async retryPayment(orderId, newPaymentData) {
    await this.delay();
    const order = await this.getById(orderId);
    
    if (order.paymentStatus === 'completed') {
      throw new Error('Payment already completed for this order');
    }
    
    const updatedOrder = {
      ...order,
      paymentResult: newPaymentData,
      paymentStatus: 'completed',
      updatedAt: new Date().toISOString(),
      paidAt: new Date().toISOString()
    };
    
    return await this.update(orderId, updatedOrder);
  }
  async processRefund(orderId, refundAmount, reason) {
    await this.delay();
const order = await this.getById(orderId);
    const refund = {
      id: Date.now(), // Use timestamp for refund ID
      orderId,
      amount: refundAmount,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };
    
    const updatedOrder = {
      ...order,
      refundRequested: true,
      refund,
      status: 'refund_requested'
    };
return await this.update(orderId, updatedOrder);
  }

async getMonthlyRevenue() {
    await this.delay();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyOrders = this.orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
});
return monthlyOrders.reduce((sum, order) => sum + (order?.total || order?.totalAmount || 0), 0);
  }
  async getRevenueByPaymentMethod() {
    await this.delay();
    const revenueByMethod = {};
    
this.orders.forEach(order => {
      const method = order?.paymentMethod || 'unknown';
      revenueByMethod[method] = (revenueByMethod[method] || 0) + (order?.total || order?.totalAmount || 0);
    });
    
    return revenueByMethod;
  }
  // Payment Verification Methods
async getPendingVerifications() {
    await this.delay();
    return this.orders
      .filter(order => {
        // Include orders with payment proof requiring verification
        const hasPaymentProof = order.paymentProof && (order.paymentProof.fileName || order.paymentProofFileName);
        const isPendingVerification = order.verificationStatus === 'pending' || 
                                    (!order.verificationStatus && hasPaymentProof &&
                                     (order.paymentMethod === 'jazzcash' || order.paymentMethod === 'easypaisa' || order.paymentMethod === 'bank'));
        return hasPaymentProof && isPendingVerification;
      })
.map(order => ({
        Id: order?.id,
        orderId: order?.id,
        transactionId: order?.transactionId || `TXN${order?.id}${Date.now().toString().slice(-4)}`,
        amount: order?.total || order?.totalAmount || 0,
        paymentMethod: order?.paymentMethod || 'unknown',
        customerName: order?.deliveryAddress?.name || 'Unknown',
        paymentProof: `/api/uploads/${order?.paymentProof?.fileName || order?.paymentProofFileName || 'default.jpg'}`, // Simulate proof URL
        paymentProofFileName: order?.paymentProof?.fileName || order?.paymentProofFileName || 'unknown',
        submittedAt: order?.paymentProof?.uploadedAt || order?.paymentProofSubmittedAt || order?.createdAt,
        verificationStatus: order?.verificationStatus || 'pending'
      }));
  }

async updateVerificationStatus(orderId, status, notes = '') {
    await this.delay();
    const orderIndex = this.orders.findIndex(o => o.id === parseInt(orderId));
    
    if (orderIndex === -1) {
      throw new Error('Order not found');
    }

    const order = this.orders[orderIndex];
    
    if (order.verificationStatus && order.verificationStatus !== 'pending') {
      throw new Error('Order verification is not pending');
    }

    const updatedOrder = {
      ...order,
      verificationStatus: status,
      verificationNotes: notes,
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'admin',
      paymentStatus: status === 'verified' ? 'completed' : 'verification_failed',
      status: status === 'verified' ? 'confirmed' : 'payment_verification_failed',
      updatedAt: new Date().toISOString()
    };

    // If verified, move order to confirmed status for processing
    if (status === 'verified') {
      updatedOrder.status = 'confirmed';
      updatedOrder.paymentVerifiedAt = new Date().toISOString();
    } else {
      updatedOrder.status = 'payment_rejected';
      updatedOrder.paymentRejectedAt = new Date().toISOString();
    }

    this.orders[orderIndex] = updatedOrder;
    return { ...updatedOrder };
  }

  async getVerificationHistory(orderId) {
    await this.delay();
    const order = await this.getById(orderId);
    
    if (!order.paymentProof) {
      return null;
    }

return {
      orderId: order?.id,
      submittedAt: order?.paymentProofSubmittedAt,
      verifiedAt: order?.verifiedAt,
      status: order?.verificationStatus || 'pending',
      notes: order?.verificationNotes || '',
      paymentProof: order?.paymentProof || null,
      paymentProofFileName: order?.paymentProofFileName || 'unknown'
    };
  }

// Order Calculation Methods
  calculateOrderSubtotal(items) {
    if (!items || !Array.isArray(items)) {
      return 0;
    }
    
    return items.reduce((subtotal, item) => {
      const itemPrice = parseFloat(item.price) || 0;
      const itemQuantity = parseInt(item.quantity) || 0;
      return subtotal + (itemPrice * itemQuantity);
    }, 0);
  }

  calculateOrderTotal(items, deliveryCharge = 0) {
    const subtotal = this.calculateOrderSubtotal(items);
    const delivery = parseFloat(deliveryCharge) || 0;
    return subtotal + delivery;
  }

  validateOrderAmount(order) {
    const calculatedSubtotal = this.calculateOrderSubtotal(order.items);
    const calculatedTotal = this.calculateOrderTotal(order.items, order.deliveryCharge);
    
    // Return calculated values if order total is missing or zero
    if (!order.total || order.total === 0) {
      return {
        subtotal: calculatedSubtotal,
        total: calculatedTotal,
        isCalculated: true
      };
    }
    
    return {
      subtotal: calculatedSubtotal,
      total: order.total,
      isCalculated: false
    };
  }

  delay() {
    return new Promise(resolve => setTimeout(resolve, 400));
  }
}

export const orderService = new OrderService();