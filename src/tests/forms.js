/**
 * Form Discovery & Validation Tests
 * Discovers forms, checks for labels, required fields, submit buttons.
 */
async function run(siteData, options = {}) {
  const tests = [];
  let totalForms = 0;

  for (const page of siteData.pages) {
    const pageLabel = new URL(page.url).pathname || '/';

    if (!page.forms || page.forms.length === 0) {
      tests.push({
        name: `Forms [${pageLabel}]`,
        status: 'info',
        message: 'No forms found on this page',
        details: null
      });
      continue;
    }

    totalForms += page.forms.length;

    for (const form of page.forms) {
      const formLabel = form.id || 'unnamed-form';

      // Check for submit button
      tests.push({
        name: `Submit Button: ${formLabel} [${pageLabel}]`,
        status: form.hasSubmitButton ? 'pass' : 'warn',
        message: form.hasSubmitButton
          ? 'Form has a submit button'
          : 'No explicit submit button found',
        details: { formId: form.id, action: form.action }
      });

      // Check form method
      tests.push({
        name: `Form Method: ${formLabel} [${pageLabel}]`,
        status: 'info',
        message: `Method: ${form.method}, Action: ${form.action || 'none'}`,
        details: { method: form.method, action: form.action }
      });

      // Check inputs for labels
      if (form.inputs.length > 0) {
        const inputsNeedingLabels = form.inputs.filter(
          i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button'
        );

        const labeledInputs = inputsNeedingLabels.filter(
          i => i.hasLabel || i.ariaLabel || i.placeholder
        );

        tests.push({
          name: `Input Labels: ${formLabel} [${pageLabel}]`,
          status: labeledInputs.length === inputsNeedingLabels.length ? 'pass' : 'fail',
          message: `${labeledInputs.length}/${inputsNeedingLabels.length} inputs have labels/placeholders`,
          details: {
            inputs: form.inputs.map(i => ({
              type: i.type,
              name: i.name,
              hasLabel: i.hasLabel,
              ariaLabel: i.ariaLabel,
              placeholder: i.placeholder
            }))
          }
        });

        // Check for required fields
        const requiredFields = form.inputs.filter(i => i.required);
        tests.push({
          name: `Required Fields: ${formLabel} [${pageLabel}]`,
          status: 'info',
          message: requiredFields.length > 0
            ? `${requiredFields.length} required field(s)`
            : 'No required fields specified',
          details: { requiredFields: requiredFields.map(i => i.name || i.type) }
        });
      }
    }
  }

  return {
    category: 'Forms',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `Found ${totalForms} form(s) across ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
