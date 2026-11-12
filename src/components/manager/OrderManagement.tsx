/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Orders Reception & Duplicate Detection Management
 */

import React, { useState } from 'react';
import {
  ShoppingCart,
  Search,
  Plus,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  MessageSquare,
  Smartphone,
  User,
  ArrowRight,
  GitMerge,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Order, OrderSource, OrderStatus } from '../../types';

interface OrderManagementProps {
  onOpenNewOrderModal: () => void;
}

export const OrderManagement: React.FC<OrderManagementProps> = ({ onOpenNewOrderModal }) => {
  const { orders, updateOrder, setManagerTab } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.phone.includes(searchQuery) ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.district.includes(searchQuery);

    const matchesStatus = selectedStatus === 'all' || o.status === selectedStatus;
    const matchesSource = selectedSource === 'all' || o.source === selectedSource;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const waitingCount = orders.filter(
    (o) => o.status === 'new' || o.status === 'waiting_clustering' || o.status === 'confirmed'
  ).length;

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    await updateOrder(orderId, { status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل طلبات المياه المركزية ({orders.length})</h2>
          <p className="text-xs text-slate-500">
            استقبال الطلبات من الاتصالات، واتساب، SMS، وتطبيق السائق مع كشف التكرار الآلي
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {waitingCount > 0 && (
            <button
              onClick={() => setManagerTab('clustering')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <GitMerge className="w-4 h-4" />
              <span>تجميع الطلبات المؤهلة ({waitingCount})</span>
            </button>
          )}
          <button
            onClick={onOpenNewOrderModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل طلب جديد</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الطلب، اسم العميل، الهاتف، أو الحي..."
            className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="all">جميع الحالات</option>
            <option value="waiting_clustering">في انتظار التجميع</option>
            <option value="clustered">مجمع برحلة</option>
            <option value="approved">معتمد للخروج</option>
            <option value="in_delivery">قيد التوصيل</option>
            <option value="delivered">تم التسليم</option>
            <option value="cancelled">ملغي</option>
          </select>

          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="all">كافة المصادر</option>
            <option value="phone">اتصال هاتفي</option>
            <option value="whatsapp">واتساب</option>
            <option value="sms">رسالة SMS</option>
            <option value="manager_manual">إدخال المدير</option>
            <option value="driver_manual">إدخال السائق</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم الطلب</th>
                <th className="py-3 px-4">العميل والهاتف</th>
                <th className="py-3 px-4">المنطقة والحي</th>
                <th className="py-3 px-4">الكمية المطلوبة</th>
                <th className="py-3 px-4">المبلغ الإجمالي</th>
                <th className="py-3 px-4">مصدر الطلب</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4">وقت التسجيل</th>
                <th className="py-3 px-4 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((ord) => {
                const isDelivered = ord.status === 'delivered';

                return (
                  <tr key={ord.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">
                      <div className="flex items-center gap-1.5">
                        <span>{ord.orderNumber}</span>
                        {ord.isUrgent && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                            عاجل
                          </span>
                        )}
                      </div>
                      {ord.duplicateWarning && (
                        <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5 font-sans font-medium">
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>احتمال تكرار ({ord.duplicateMatchedOrderId})</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{ord.customerName}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{ord.phone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                        {ord.district}
                      </span>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                        {ord.addressDetails}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      <div>{ord.requestedLiters.toLocaleString()} لتر</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        سعة الخزان: {ord.tankCapacity.toLocaleString()}L
                        {` (${(ord.tankRemainingLiters ?? 0) === 0 ? 'فارغ 0L' : `باقي ${ord.tankRemainingLiters}L`})`}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-emerald-800">{ord.totalAmount.toLocaleString()} ر.ي</div>
                      <div className="text-[10px] text-slate-400">{ord.pricePerLiter} ر.ي/لتر</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-slate-600 flex items-center gap-1">
                        {getSourceIcon(ord.source)}
                        <span>{getOrderSourceArabic(ord.source)}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${getStatusBadgeClass(ord.status)}`}>
                        {getOrderStatusArabic(ord.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px] font-mono">
                      {new Date(ord.createdAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <select
                        value={ord.status}
                        onChange={(e) => handleStatusChange(ord.id, e.target.value as OrderStatus)}
                        disabled={isDelivered}
                        className="text-[11px] border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 disabled:opacity-50"
                      >
                        <option value="waiting_clustering">انتظار تجميع</option>
                        <option value="confirmed">تأكيد الطلب</option>
                        <option value="approved">اعتماد خروج</option>
                        <option value="in_delivery">قيد التوصيل</option>
                        <option value="delivered">تم التسليم</option>
                        <option value="postponed">تأجيل</option>
                        <option value="cancelled">إلغاء</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function getSourceIcon(source: OrderSource) {
  switch (source) {
    case 'phone': return <Phone className="w-3 h-3 text-sky-600" />;
    case 'whatsapp': return <MessageSquare className="w-3 h-3 text-emerald-600" />;
    case 'sms': return <MessageSquare className="w-3 h-3 text-blue-600" />;
    case 'driver_manual': return <Smartphone className="w-3 h-3 text-amber-600" />;
    default: return <User className="w-3 h-3 text-slate-600" />;
  }
}

function getOrderSourceArabic(source: OrderSource): string {
  switch (source) {
    case 'phone': return 'اتصال هاتفي';
    case 'whatsapp': return 'واتساب';
    case 'sms': return 'رسالة SMS';
    case 'manager_manual': return 'إدخال المدير';
    case 'driver_manual': return 'إدخال السائق';
    case 'customer_app': return 'تطبيق العميل';
    default: return source;
  }
}

function getOrderStatusArabic(status: OrderStatus): string {
  switch (status) {
    case 'new': return 'جديد';
    case 'under_review': return 'قيد المراجعة';
    case 'confirmed': return 'مؤكد';
    case 'waiting_clustering': return 'في انتظار التجميع';
    case 'clustered': return 'مجمع برحلة';
    case 'approved': return 'معتمد للخروج';
    case 'in_delivery': return 'قيد التوصيل';
    case 'delivered': return 'تم التسليم بنجاح';
    case 'cancelled': return 'ملغي';
    case 'postponed': return 'مؤجل';
    default: return status;
  }
}

function getStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case 'waiting_clustering':
    case 'new':
      return 'bg-amber-100 text-amber-800';
    case 'clustered':
    case 'confirmed':
      return 'bg-sky-100 text-sky-800';
    case 'approved':
    case 'in_delivery':
      return 'bg-blue-100 text-blue-800';
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800';
    case 'cancelled':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
