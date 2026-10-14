import { defaultPhoto, defaultProduct, productKey } from './default-catalog';
import { DEFAULT_PRODUCTS } from './default-products';

describe('standart mahsulot katalogi', () => {
  it('apostrofning har xil ko‘rinishi va bo‘shliqlar bir xil hisoblanadi', () => {
    expect(productKey("  Qo'y  go`shti ")).toBe(productKey('Qo‘y go‘shti'));
    expect(productKey('QO’Y GO’SHTI')).toBe(productKey('qo‘y go‘shti'));
  });

  it('nomi yoki qavsdagi izohsiz nomi bo‘yicha topiladi', () => {
    expect(defaultProduct('mol go’shti')?.name).toBe('Mol go‘shti');
    expect(defaultProduct('Mol go‘shti (lahm, suyaksiz)')?.name).toBe('Mol go‘shti');
    expect(defaultProduct('Noma’lum mahsulot')).toBeUndefined();
  });

  it('rasm bo‘lsa — frontend public papkasidagi yo‘l; bo‘lmasa — null', () => {
    expect(defaultPhoto('Kartoshka')).toEqual({
      url: '/kitchen/products/kartoshka.webp',
      thumbUrl: '/kitchen/products/kartoshka.webp',
    });
    expect(defaultPhoto('Noma’lum mahsulot')).toBeNull();
  });

  it('katalogda takroriy nom yo‘q', () => {
    const keys = DEFAULT_PRODUCTS.map((product) => productKey(product.name));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
