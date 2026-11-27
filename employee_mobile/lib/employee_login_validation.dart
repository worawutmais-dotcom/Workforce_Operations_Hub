/// Returns a concise Thai recovery message for an incomplete self-login form.
/// The employee identity is intentionally typed, not selected from a public
/// directory of names.
String? employeeLoginError({
  required String employeeId,
  required String password,
}) {
  if (employeeId.trim().isEmpty) return 'กรอกรหัสพนักงาน';
  if (password.trim().isEmpty) return 'กรอกรหัสผ่าน';
  return null;
}
