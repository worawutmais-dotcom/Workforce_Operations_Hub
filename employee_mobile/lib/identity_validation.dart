class EmployeeIdentityValidation {
  const EmployeeIdentityValidation({
    required this.nationalIdDigits,
    required this.phoneDigits,
  });

  final int nationalIdDigits;
  final int phoneDigits;

  bool get canSubmit => nationalIdDigits == 13 && phoneDigits == 10;

  String get nationalIdHint => nationalIdDigits >= 13
      ? 'ครบ 13 หลัก'
      : 'กรอกอีก ${13 - nationalIdDigits} หลัก';

  String get phoneHint =>
      phoneDigits >= 10 ? 'ครบ 10 หลัก' : 'กรอกอีก ${10 - phoneDigits} หลัก';
}

EmployeeIdentityValidation validateEmployeeIdentity({
  required String nationalId,
  required String phone,
}) {
  int countDigits(String value) => value.replaceAll(RegExp(r'[^0-9]'), '').length;
  return EmployeeIdentityValidation(
    nationalIdDigits: countDigits(nationalId),
    phoneDigits: countDigits(phone),
  );
}
