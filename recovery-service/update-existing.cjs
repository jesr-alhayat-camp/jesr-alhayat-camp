// A null proposal lets RTDB retry with server data when its local cache is empty.
// An absent server record stays absent and never authorizes an operation.
async function updateExisting(ref, update) {
  const result = await ref.transaction(current => current === null ? null : update(current));
  return result.committed ? result.snapshot.val() : null;
}

module.exports = {updateExisting};
