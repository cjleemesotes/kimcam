export type HashAlgo = 'sha256' | 'sha512' | 'blake3';

export type HashSuccess = {
  ok: true;
  hash: string;      // hex
  bytes: number;
  algo: HashAlgo;
};

export type HashError = {
  ok: false;
  code: 'EIO' | 'EUNSUPPORTED' | 'EBROWSER' | 'ETYPE' | 'EUNKNOWN';
  message: string;
  cause?: unknown;
};

export type HashResult = HashSuccess | HashError;
