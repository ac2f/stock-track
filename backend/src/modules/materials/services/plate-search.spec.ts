import { searchTokens } from './plates.service';

describe('stok araması sözcükleri', () => {
  it('sıra, ondalık virgül, ebat ve birimden bağımsız', () => {
    expect(searchTokens('Beyaz 2,8mm akpolimer')).toEqual(['Beyaz', '2.8', 'akpolimer']);
    expect(searchTokens('1220x2440 dökme')).toEqual(['1220', '2440', 'dökme']);
    expect(searchTokens('  ')).toEqual([]);
    expect(searchTokens(undefined)).toEqual([]);
  });

  it('LIKE joker karakterlerini kaçırır', () => {
    expect(searchTokens('100%')).toEqual(['100\\%']);
  });
});
