import 'package:flutter/material.dart';

import 'bvn_api.dart';

class TimeRequestTab extends StatefulWidget {
  const TimeRequestTab({super.key, required this.token});
  final String token;

  @override
  State<TimeRequestTab> createState() => _TimeRequestTabState();
}

class _TimeRequestTabState extends State<TimeRequestTab> {
  String _type = 'overtime';
  DateTime _workDate = DateTime.now();
  int _minutes = 60;
  bool _sending = false;
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _workDate,
      firstDate: DateTime.now().subtract(const Duration(days: 31)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null && mounted) setState(() => _workDate = picked);
  }

  Future<void> _submit() async {
    if (_reason.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('ระบุเหตุผลก่อนส่งคำขอ')));
      return;
    }
    setState(() => _sending = true);
    try {
      await BvnApi().submitTimeRequest(
        token: widget.token,
        requestType: _type,
        workDate: _workDate,
        requestedMinutes: _minutes,
        reason: _reason.text.trim(),
      );
      if (!mounted) return;
      _reason.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ส่งคำขอให้ Admin ตรวจสอบแล้ว')),
      );
    } on BvnApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String get _thaiDate =>
      '${_workDate.day}/${_workDate.month}/${_workDate.year + 543}';

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'ขอ OT / แก้ไขเวลา',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text('คำขอจะไม่เปลี่ยนเวลาหรือเงินเดือนจนกว่า Admin จะอนุมัติ'),
        const SizedBox(height: 20),
        DropdownButtonFormField<String>(
          initialValue: _type,
          decoration: const InputDecoration(
            labelText: 'ประเภทคำขอ',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'overtime', child: Text('ขอทำ OT')),
            DropdownMenuItem(
              value: 'attendance_correction',
              child: Text('ขอแก้ไขเวลา'),
            ),
          ],
          onChanged: _sending
              ? null
              : (value) => setState(() => _type = value ?? _type),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: _sending ? null : _pickDate,
          icon: const Icon(Icons.calendar_today_outlined),
          label: Text('วันที่ทำงาน: $_thaiDate'),
        ),
        const SizedBox(height: 14),
        DropdownButtonFormField<int>(
          initialValue: _minutes,
          decoration: const InputDecoration(
            labelText: 'จำนวนนาทีที่ขอ',
            border: OutlineInputBorder(),
          ),
          items: const [30, 60, 90, 120, 180, 240, 480]
              .map(
                (value) =>
                    DropdownMenuItem(value: value, child: Text('$value นาที')),
              )
              .toList(),
          onChanged: _sending
              ? null
              : (value) => setState(() => _minutes = value ?? _minutes),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _reason,
          maxLines: 4,
          enabled: !_sending,
          decoration: const InputDecoration(
            labelText: 'เหตุผล / รายละเอียด',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _sending ? null : _submit,
          icon: const Icon(Icons.send_outlined),
          label: Text(_sending ? 'กำลังส่ง…' : 'ส่งคำขอ'),
        ),
      ],
    );
  }
}
