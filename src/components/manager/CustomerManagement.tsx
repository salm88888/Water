/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Customer Management (إدارة العملاء والخزانات في مأرب)
 */

import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  Droplet,
  Edit2,
  Calendar,
  CheckCircle,
  X,
  ExternalLink,
  Compass,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Customer } from '../../types';
import { LocationPickerMapModal } from '../common/LocationPickerMapModal';

export const CustomerManagement: React.FC = () => {
  const { customers, addCustomer, updateCustomer, setSelectedCustomer, setManagerTab, settings } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [hasPickedFromMap, setHasPickedFromMap] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    altPhone: '',
    district: 'حي الروضة',
    addressDetails: '',
    lat: 15.4712,
    lng: 45.3340,
    tankCapacityLiters: 2000,
    tankRemainingLiters: 0,
    notes: '',
  });

  const districts = ['حي الروضة', 'حي الشركة', 'المجمع الحكومي', 'حي السلام', 'حي المطار', 'حي الفاو', 'الخسيف', 'حصون آل جلال', 'جو النسيم'];

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.customerId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDistrict = selectedDistrict === 'all' || c.district === selectedDistrict;
    return matchesSearch && matchesDistrict;
  });

  const handleOpenAdd = (openMapImmediately = false) => {
    setEditingCustomer(null);
    setHasPickedFromMap(false);
    setFormData({
      name: '',
      phone: '',
      altPhone: '',
      district: 'حي الروضة',
      addressDetails: '',
      lat: 15.4712,
      lng: 45.3340,
      tankCapacityLiters: 2000,
      tankRemainingLiters: 0,
      notes: '',
    });
    setShowAddModal(true);
    if (openMapImmediately) {
      setIsMapPickerOpen(true);
    }
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setHasPickedFromMap(true);
    setFormData({
      name: c.name,
      phone: c.phone,
      altPhone: c.altPhone || '',
      district: c.district,
      addressDetails: c.addressDetails,
      lat: c.lat,
      lng: c.lng,
      tankCapacityLiters: c.tankCapacityLiters,
      tankRemainingLiters: c.tankRemainingLiters || 0,
      notes: c.notes || '',
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return;

    if (editingCustomer) {
      await updateCustomer(editingCustomer.id, formData);
    } else {
      await addCustomer(formData);
    }
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل عملاء المياه في مأرب ({customers.length})</h2>
          <p className="text-xs text-slate-500">
            إدارة بيانات العملاء، سعات الخزانات، والكميات المتبقية وإحداثيات GPS الدقيقة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleOpenAdd(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
            title="إضافة عميل جديد وتحديد موقعه بالدبوس على الخريطة مباشرة"
          >
            <MapPin className="w-4 h-4" />
            <span>تحديد العميل بالدبوس على الخريطة</span>
          </button>
          <button
            onClick={() => handleOpenAdd(false)}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل جديد</span>
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
            placeholder="بحث باسم العميل، رقم الهاتف (سبأفون)، أو معرف العميل..."
            className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">المنطقة / الحي:</span>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          >
            <option value="all">جميع أحياء مأرب ({customers.length})</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Customer Cards & Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم العميل</th>
                <th className="py-3 px-4">اسم العميل</th>
                <th className="py-3 px-4">رقم الهاتف (سبأفون)</th>
                <th className="py-3 px-4">المنطقة والحي</th>
                <th className="py-3 px-4">سعة الخزان</th>
                <th className="py-3 px-4">الماء المتبقي</th>
                <th className="py-3 px-4">إجمالي الطلبات</th>
                <th className="py-3 px-4">إحداثيات GPS</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((cust) => {
                const remaining = cust.tankRemainingLiters ?? 0;
                const fillPercent = cust.tankCapacityLiters > 0
                  ? Math.round((remaining / cust.tankCapacityLiters) * 100)
                  : 0;

                return (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">{cust.customerId}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{cust.name}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{cust.addressDetails}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      <a href={`tel:${cust.phone}`} className="hover:text-sky-700 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{cust.phone}</span>
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                        {cust.district}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {cust.tankCapacityLiters.toLocaleString()} لتر
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${fillPercent <= 25 ? 'bg-rose-500' : 'bg-sky-500'}`}
                            style={{ width: `${fillPercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-slate-600">
                          {remaining === 0 ? '0L (فارغ)' : `${remaining}L`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {cust.totalOrdersCount} طلبات
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenEdit(cust);
                          setIsMapPickerOpen(true);
                        }}
                        className="text-slate-600 hover:text-rose-600 flex items-center gap-1 bg-slate-100 hover:bg-rose-50 px-2 py-0.5 rounded cursor-pointer transition-colors"
                        title="عرض وتعديل موضع الدبوس على الخريطة"
                      >
                        <MapPin className="w-3 h-3 text-rose-500" />
                        <span>{cust.lat.toFixed(4)}, {cust.lng.toFixed(4)}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            handleOpenEdit(cust);
                            setIsMapPickerOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="تعديل موقع الدبوس على الخريطة"
                        >
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cust)}
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded cursor-pointer"
                          title="تعديل بيانات العميل والخزان"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">
                {editingCustomer ? 'تعديل بيانات العميل والخزان' : 'تسجيل عميل مياه جديد في مأرب'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اسم العميل الثلاثي *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد محمد مبخوت"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الهاتف (سبأفون) *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="71xxxxxxx"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">هاتف بديل (اختياري)</label>
                  <input
                    type="text"
                    value={formData.altPhone}
                    onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })}
                    placeholder="77xxxxxxx"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">المنطقة والحي بمأرب *</label>
                  <select
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                  >
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">سعة خزان العميل (لتر) *</label>
                  <select
                    value={formData.tankCapacityLiters}
                    onChange={(e) => setFormData({ ...formData, tankCapacityLiters: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-mono"
                  >
                    <option value={500}>500 لتر (خزان صغير)</option>
                    <option value={1000}>1,000 لتر</option>
                    <option value={2000}>2,000 لتر (الافتراضي للمنازل)</option>
                    <option value={3000}>3,000 لتر</option>
                    <option value={5000}>5,000 لتر (مطاعم ومشاريع)</option>
                    <option value={6000}>6,000 لتر (حمولة وايت كاملة)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">الكمية المتبقية حالياً بالخزان (لتر)</label>
                <input
                  type="number"
                  min={0}
                  value={formData.tankRemainingLiters}
                  onChange={(e) => setFormData({ ...formData, tankRemainingLiters: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  placeholder="الافتراضي 0 لتر (خزان فارغ)"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  يفترض النظام دائماً أن خزان العميل فارغ (0 لتر)؛ إذا السعة 2,000L يقترح النظام تعبئة 2,000L بالكامل.
                </span>
              </div>

              {/* Interactive Map Pin Selection Card */}
              <div className="bg-gradient-to-r from-rose-50 via-sky-50 to-slate-50 border border-rose-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span>تحديد موقع العميل على الخريطة</span>
                        <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded">
                          دبوس GPS
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        انقر لوضع الدبوس على منزل العميل في مأرب لاستخراج الإحداثيات والحي بدقة
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMapPickerOpen(true)}
                    className="w-full sm:w-auto px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>{hasPickedFromMap ? 'تعديل موضع الدبوس على الخريطة' : 'فتح الخريطة ووضع الدبوس'}</span>
                  </button>
                </div>

                {hasPickedFromMap ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2 text-[11px] font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      تم التقاط الموقع بنجاح: <strong>{formData.district}</strong> ({formData.lat.toFixed(6)}, {formData.lng.toFixed(6)})
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 bg-white/70 border border-slate-200 rounded-lg p-2 flex items-center justify-between">
                    <span>الإحداثيات الحالية: {formData.lat.toFixed(4)}, {formData.lng.toFixed(4)}</span>
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className="text-sky-700 font-bold hover:underline"
                    >
                      حدد بالدبوس 📍
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">العنوان التفصيلي والعلامات البارزة</label>
                <input
                  type="text"
                  value={formData.addressDetails}
                  onChange={(e) => setFormData({ ...formData, addressDetails: e.target.value })}
                  placeholder="مثال: الشارع العام - خلف صيدلية الأمل - عمارة دورين"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">خط العرض (Latitude GPS)</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">خط الطول (Longitude GPS)</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">ملاحظات تشغيلية للسائق</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="مثال: خزان سطحي يحتاج لي 25 متر - شارع ضيق"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold"
                >
                  {editingCustomer ? 'حفظ التعديلات' : 'تسجيل العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Location Picker Map Modal */}
      <LocationPickerMapModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        customerName={formData.name || 'العميل الجديد'}
        initialLat={formData.lat}
        initialLng={formData.lng}
        initialDistrict={formData.district}
        existingCustomers={customers}
        settings={settings}
        onSelectLocation={({ lat, lng, district }) => {
          setFormData((prev) => ({
            ...prev,
            lat,
            lng,
            district: district || prev.district,
          }));
          setHasPickedFromMap(true);
        }}
      />
    </div>
  );
};
