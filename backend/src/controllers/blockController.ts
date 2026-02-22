import { Request, Response } from 'express';
import prisma from '../config/database';

export const getBlocks = async (req: Request, res: Response) => {
  try {
    const blocks = await prisma.block.findMany({
      include: {
        groups: {
          where: { approvalStatus: 'APPROVED' },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { groups: { where: { approvalStatus: 'APPROVED' } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(blocks);
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const createBlock = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название блока обязательно' });
    }

    const existingBlock = await prisma.block.findUnique({
      where: { name: name.trim() },
    });

    if (existingBlock) {
      return res.status(400).json({ error: 'Блок с таким названием уже существует' });
    }

    const block = await prisma.block.create({
      data: { name: name.trim() },
      include: {
        groups: {
          select: { id: true, name: true },
        },
        _count: {
          select: { groups: true },
        },
      },
    });

    res.status(201).json(block);
  } catch (error) {
    console.error('Create block error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const updateBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название блока обязательно' });
    }

    const existingBlock = await prisma.block.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingBlock) {
      return res.status(404).json({ error: 'Блок не найден' });
    }

    const duplicateBlock = await prisma.block.findFirst({
      where: {
        name: name.trim(),
        NOT: { id: parseInt(id) },
      },
    });

    if (duplicateBlock) {
      return res.status(400).json({ error: 'Блок с таким названием уже существует' });
    }

    const block = await prisma.block.update({
      where: { id: parseInt(id) },
      data: { name: name.trim() },
      include: {
        groups: {
          select: { id: true, name: true },
        },
        _count: {
          select: { groups: true },
        },
      },
    });

    res.json(block);
  } catch (error) {
    console.error('Update block error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const deleteBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const blockId = parseInt(id);

    const existingBlock = await prisma.block.findUnique({
      where: { id: blockId },
    });

    if (!existingBlock) {
      return res.status(404).json({ error: 'Блок не найден' });
    }

    // Groups will have blockId set to NULL automatically (onDelete: SetNull)
    await prisma.block.delete({
      where: { id: blockId },
    });

    res.json({ message: 'Блок успешно удалён' });
  } catch (error) {
    console.error('Delete block error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
