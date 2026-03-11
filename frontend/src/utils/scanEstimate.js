/**
 * Estimate total IPs from a targets string (CIDRs, ranges, single IPs).
 */
export function countTargetIPs(targets) {
  if (!targets || !targets.trim()) return 0
  let total = 0
  for (const part of targets.trim().split(/[\s,]+/)) {
    const cidr = part.match(/\/(\d+)$/)
    if (cidr) {
      total += Math.pow(2, 32 - parseInt(cidr[1]))
    } else if (part.includes('-')) {
      // e.g. 10.0.0.1-10.0.0.50 — rough approximation
      const [, end] = part.split('-')
      const endOctets = end.split('.')
      total += endOctets.length === 4
        ? (parseInt(endOctets[3]) || 50)
        : 256
    } else if (part) {
      total += 1 // single IP
    }
  }
  return total
}

/**
 * Count ports from a ports string like "80,443,8080-8090".
 */
export function countPorts(ports) {
  if (!ports) return 1
  let count = 0
  for (const part of ports.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      count += (b - a + 1) || 1
    } else {
      count += 1
    }
  }
  return count || 1
}

/**
 * Returns a human-readable ETA string.
 */
export function formatETA(seconds) {
  if (!seconds || seconds <= 0) return null
  if (seconds < 60)   return `~${Math.ceil(seconds)}s`
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)} min`
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)} h`
  return `~${(seconds / 86400).toFixed(1)} days`
}

/**
 * Estimate total scan duration in seconds.
 */
export function estimateScanSeconds(targets, ports, rate) {
  const ips  = countTargetIPs(targets)
  const p    = countPorts(ports)
  const r    = Math.max(rate || 1000, 1)
  return (ips * p) / r
}
